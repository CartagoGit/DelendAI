/**
 * external-mcp/health.spec.ts — f00193 (Track K / external MCPs).
 *
 * Pins the health classifier + the probe wrapper. Privacy R1.1: the
 * provider id is public; reason strings are sanitised before
 * exposure.
 */

import { describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_DEGRADED_LATENCY_MS,
	DEFAULT_DOWN_LATENCY_MS,
	classifyHealth,
	probeProvider,
	worstOf,
} from '../../../src/services/external-mcp/health';
import type { IExternalMcpProvider } from '../../../src/services/external-mcp/types';

const makeProvider = (
	probeImpl: () => Promise<{ ok: boolean; latencyMs: number }>,
): IExternalMcpProvider => ({
	id: 'acme-mcp',
	transport: 'http',
	capabilities: ['chat'],
	healthCheck: vi.fn(async () => {
		const { ok, latencyMs } = await probeImpl();
		return { ok, latencyMs, checkedAt: new Date().toISOString() };
	}),
	connect: async () => ({
		ping: async () => ({ ok: true, latencyMs: 1 }),
		close: async () => {},
	}),
});

describe('f00193 — external-mcp.health (Track K)', () => {
	describe('classifyHealth', () => {
		it('marks low-latency success as healthy', () => {
			expect(
				classifyHealth({
					ok: true,
					latencyMs: 10,
					checkedAt: '2026-08-26T00:00:00Z',
				}),
			).toBe('healthy');
		});

		it('marks medium-latency success as degraded', () => {
			expect(
				classifyHealth({
					ok: true,
					latencyMs: DEFAULT_DEGRADED_LATENCY_MS + 1,
					checkedAt: '2026-08-26T00:00:00Z',
				}),
			).toBe('degraded');
		});

		it('marks a failed probe as down regardless of latency', () => {
			// A probe that explicitly returned `ok: false` is always down.
			// The router relies on this so the registry never routes
			// to a provider whose own healthCheck said it was sick.
			expect(
				classifyHealth({
					ok: false,
					latencyMs: DEFAULT_DOWN_LATENCY_MS - 1,
					checkedAt: '2026-08-26T00:00:00Z',
				}),
			).toBe('down');
			expect(
				classifyHealth({
					ok: false,
					latencyMs: DEFAULT_DOWN_LATENCY_MS + 10,
					checkedAt: '2026-08-26T00:00:00Z',
				}),
			).toBe('down');
		});

		it('respects custom thresholds', () => {
			expect(
				classifyHealth(
					{
						ok: true,
						latencyMs: 150,
						checkedAt: '2026-08-26T00:00:00Z',
					},
					{ degradedLatencyMs: 100, downLatencyMs: 200 },
				),
			).toBe('degraded');
		});
	});

	describe('probeProvider', () => {
		it('returns healthy when the provider probe succeeds quickly', async () => {
			const provider = makeProvider(async () => ({
				ok: true,
				latencyMs: 5,
			}));
			const result = await probeProvider(provider);
			expect(result.state).toBe('healthy');
			expect(result.probe.ok).toBe(true);
			expect(result.probe.latencyMs).toBe(5);
		});

		it('downgrades to down when the probe throws', async () => {
			const provider: IExternalMcpProvider = {
				id: 'flaky',
				transport: 'http',
				capabilities: ['chat'],
				healthCheck: async () => {
					throw new Error('socket reset');
				},
				connect: async () => ({
					ping: async () => ({ ok: true, latencyMs: 1 }),
					close: async () => {},
				}),
			};
			const result = await probeProvider(provider);
			expect(result.state).toBe('down');
			expect(result.probe.ok).toBe(false);
			expect(result.probe.reason).toBe('socket reset');
		});

		it('treats a non-Error throw as a generic probe failure', async () => {
			const provider: IExternalMcpProvider = {
				id: 'stringy',
				transport: 'stdio',
				capabilities: ['chat'],
				healthCheck: async () => {
					throw 'plain string';
				},
				connect: async () => ({
					ping: async () => ({ ok: true, latencyMs: 1 }),
					close: async () => {},
				}),
			};
			const result = await probeProvider(provider);
			expect(result.state).toBe('down');
			expect(result.probe.reason).toBe('probe failed');
		});
	});

	describe('worstOf', () => {
		it('returns the worse of two states', () => {
			expect(worstOf('healthy', 'healthy')).toBe('healthy');
			expect(worstOf('healthy', 'degraded')).toBe('degraded');
			expect(worstOf('degraded', 'down')).toBe('down');
			expect(worstOf('down', 'healthy')).toBe('down');
		});
	});
});
