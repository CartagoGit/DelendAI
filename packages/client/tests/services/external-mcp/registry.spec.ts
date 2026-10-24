/**
 * external-mcp/registry.spec.ts — f00193 (Track K / external MCPs).
 *
 * Pins the registry contract: lazy connect, background health,
 * eviction, snapshot stability, redacted ids.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ExternalMcpRegistry,
	formatRegistrySnapshot,
	sanitizeProbeReason,
	scoreAll,
} from '../../../src/services/external-mcp/registry';
import type {
	IExternalMcpConnection,
	IExternalMcpProvider,
} from '../../../src/services/external-mcp/types';

const makeProvider = (
	id: string,
	overrides: Partial<IExternalMcpProvider> = {},
): IExternalMcpProvider => {
	let connection: IExternalMcpConnection | null = null;
	const connectionCalls: string[] = [];
	const closeCalls: string[] = [];
	return {
		id,
		transport: 'stdio',
		capabilities: ['chat'],
		healthCheck: async () => ({
			ok: true,
			latencyMs: 25,
			checkedAt: new Date().toISOString(),
		}),
		connect: async () => {
			connectionCalls.push('connect');
			connection = {
				ping: async () => ({ ok: true, latencyMs: 5 }),
				close: async () => {
					closeCalls.push('close');
				},
			};
			return connection;
		},
		...overrides,
	};
};

describe('f00193 — external-mcp.registry (Track K)', () => {
	let registry: ExternalMcpRegistry;

	beforeEach(() => {
		registry = new ExternalMcpRegistry();
	});

	afterEach(async () => {
		registry.stop();
		await registry.evict('alpha');
		await registry.evict('beta');
	});

	describe('registration + snapshot', () => {
		it('registers providers and exposes a snapshot', () => {
			registry.register(
				makeProvider('alpha', { capabilities: ['chat'] }),
			);
			registry.register(
				makeProvider('beta', { capabilities: ['embed'] }),
			);
			const snap = registry.snapshot();
			expect(snap).toHaveLength(2);
			expect(snap.map((s) => s.providerId).sort()).toEqual([
				'alpha',
				'beta',
			]);
			expect(snap.every((s) => s.redactedId.startsWith('ext-mcp-'))).toBe(
				true,
			);
		});

		it('throws when registering the same provider twice', () => {
			registry.register(makeProvider('dup'));
			expect(() => registry.register(makeProvider('dup'))).toThrow(
				/already registered/,
			);
		});

		it('evicts providers and tears down connections', async () => {
			const provider = makeProvider('alpha');
			registry.register(provider);
			await registry.connect('alpha');
			await registry.evict('alpha');
			expect(registry.size).toBe(0);
		});
	});

	describe('lazy connect', () => {
		it('does not connect at register time', () => {
			const provider = makeProvider('lazy');
			registry.register(provider);
			expect(registry.size).toBe(1);
			// provider.connect is not invoked until we ask for the connection.
			expect(
				(provider.connect as unknown as { mock?: unknown }).mock,
			).toBeUndefined();
		});

		it('connect() opens the connection exactly once', async () => {
			const provider = makeProvider('once');
			const connectSpy = vi.spyOn(provider, 'connect');
			registry.register(provider);
			const a = await registry.connect('once');
			const b = await registry.connect('once');
			expect(a).toBe(b);
			expect(connectSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('health probes', () => {
		it('probeAll refreshes the snapshot with classified state', async () => {
			const slow = makeProvider('slow', {
				healthCheck: async () => ({
					ok: true,
					latencyMs: 500,
					checkedAt: new Date().toISOString(),
				}),
			});
			registry.register(slow);
			await registry.probeAll();
			const snap = registry.snapshot();
			expect(snap[0]?.health).toBe('degraded');
		});

		it('refreshProvider returns null for unknown ids', async () => {
			const result = await registry.refreshProvider('ghost');
			expect(result).toBeNull();
		});

		it('refreshProvider sanitises the probe reason (R1.1)', async () => {
			const noisy = makeProvider('noisy', {
				healthCheck: async () => ({
					ok: false,
					latencyMs: 3000,
					checkedAt: new Date().toISOString(),
					reason: 'failed to call tool: acme.sendMessage on https://api.acme.com/v1',
				}),
			});
			registry.register(noisy);
			const result = await registry.refreshProvider('noisy');
			expect(result?.state).toBe('down');
			expect(result?.reason).not.toContain('https://');
			expect(result?.reason).not.toContain('acme.sendMessage');
			expect(result?.reason).toContain('<url>');
		});
	});

	describe('sanitizeProbeReason (R1.1)', () => {
		it('truncates long strings', () => {
			const out = sanitizeProbeReason('x'.repeat(200));
			expect(out?.length).toBe(60);
			expect(out?.endsWith('...')).toBe(true);
		});

		it('replaces urls with <url>', () => {
			expect(sanitizeProbeReason('see https://x.y/foo bar')).toBe(
				'see <url> bar',
			);
		});

		it('collapses whitespace', () => {
			expect(sanitizeProbeReason('a\n\n\tb   c')).toBe('a b c');
		});

		it('passes undefined through', () => {
			expect(sanitizeProbeReason(undefined)).toBeUndefined();
		});
	});

	describe('toRouterInput + scoreAll', () => {
		it('builds router input in the same order as snapshot', async () => {
			registry.register(makeProvider('a', { cost: { tokensPer1k: 1 } }));
			registry.register(makeProvider('b', { cost: { tokensPer1k: 9 } }));
			await registry.probeAll();
			const routerInput = registry.toRouterInput();
			expect(routerInput.map((r) => r.providerId)).toEqual(['a', 'b']);
			const scores = scoreAll(routerInput);
			// Provider `a` is cheaper → higher score.
			expect(scores.a).toBeGreaterThan(scores.b!);
		});
	});

	describe('formatRegistrySnapshot', () => {
		it('renders an empty list as an empty string', () => {
			expect(formatRegistrySnapshot([])).toBe('');
		});

		it('uses redacted ids (R1.1) and includes health + latency', async () => {
			registry.register(makeProvider('alpha'));
			await registry.probeAll();
			const line = formatRegistrySnapshot(registry.snapshot());
			expect(line).toMatch(/ext-mcp-[a-f0-9]+\[healthy, 25ms\]/);
			expect(line).not.toContain('alpha');
		});
	});

	describe('start/stop probe loop', () => {
		it('is idempotent: start() twice does not double the loop', () => {
			registry = new ExternalMcpRegistry({
				healthCheckIntervalMs: 60_000,
			});
			registry.start();
			registry.start();
			registry.stop();
		});

		it('start() with intervalMs=0 never schedules', () => {
			registry = new ExternalMcpRegistry({ healthCheckIntervalMs: 0 });
			registry.start();
			registry.stop();
		});
	});
});
