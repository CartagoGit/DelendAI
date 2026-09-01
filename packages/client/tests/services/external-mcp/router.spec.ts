/**
 * external-mcp/router.spec.ts — f00193 (Track K / external MCPs).
 *
 * Pins the router contract:
 *   - capability match is required,
 *   - excluded providers are never picked,
 *   - preferred providers win on tie,
 *   - failover to the lowest-cost degraded candidate when no
 *     healthy provider is available,
 *   - refusal shape when nothing is eligible,
 *   - selection carries BOTH the real providerId AND a redactedId
 *     (R1.1: same id always redacts the same way within a session),
 *   - selection is deterministic: same input ⇒ same output.
 */

import { describe, expect, it } from 'vitest';

import {
	redactProviderId,
	scoreProvider,
	selectProvider,
	selectWithFailover,
	type IRouterInput,
} from '../../../src/services/external-mcp/router';
import type {
	IExternalMcpRefusal,
	IExternalMcpSelection,
} from '../../../src/services/external-mcp/types';

const make = (
	overrides: Partial<IRouterInput> & { providerId: string },
): IRouterInput => ({
	capabilities: ['chat'],
	health: 'healthy',
	latencyMs: 50,
	...overrides,
});

const expectSelection = (
	result: IExternalMcpSelection | IExternalMcpRefusal,
): IExternalMcpSelection => {
	if (result.kind === 'external-mcp-no-provider') {
		throw new Error('expected a selection, got a refusal');
	}
	return result;
};

const expectRefusal = (
	result: IExternalMcpSelection | IExternalMcpRefusal,
): IExternalMcpRefusal => {
	if (result.kind !== 'external-mcp-no-provider') {
		throw new Error('expected a refusal, got a selection');
	}
	return result;
};

describe('f00193 — external-mcp.router (Track K)', () => {
	describe('scoreProvider', () => {
		it('penalises cost, latency and health penalties; rewards priority + preferred', () => {
			const baseline = scoreProvider(
				make({
					providerId: 'a',
					cost: { tokensPer1k: 1 },
					latencyMs: 50,
				}),
				undefined,
			);
			const cheaper = scoreProvider(
				make({
					providerId: 'b',
					cost: { tokensPer1k: 0 },
					latencyMs: 50,
				}),
				undefined,
			);
			expect(cheaper).toBeGreaterThan(baseline);

			const faster = scoreProvider(
				make({
					providerId: 'c',
					cost: { tokensPer1k: 1 },
					latencyMs: 10,
				}),
				undefined,
			);
			expect(faster).toBeGreaterThan(baseline);

			const degraded = scoreProvider(
				make({
					providerId: 'd',
					cost: { tokensPer1k: 1 },
					latencyMs: 50,
					health: 'degraded',
				}),
				undefined,
			);
			expect(degraded).toBeLessThan(baseline);

			const preferred = scoreProvider(
				make({
					providerId: 'e',
					cost: { tokensPer1k: 1 },
					latencyMs: 50,
				}),
				{ preferred: ['e'] },
			);
			expect(preferred).toBeGreaterThan(baseline);
		});

		it('treats absent cost as free (cheapest possible)', () => {
			const free = scoreProvider(make({ providerId: 'f' }), undefined);
			const paid = scoreProvider(
				make({ providerId: 'g', cost: { tokensPer1k: 1 } }),
				undefined,
			);
			expect(free).toBeGreaterThan(paid);
		});
	});

	describe('selectProvider', () => {
		it('returns a refusal when no provider exposes the capability', () => {
			let result = selectProvider({
				capability: 'embed',
				providers: [make({ providerId: 'a', capabilities: ['chat'] })],
			});
			result = expectRefusal(result);
			expect(result.capability).toBe('embed');
			expect(result.candidates).toEqual([]);
		});

		it('returns a refusal when every eligible provider is in `excluded`', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [make({ providerId: 'a' })],
				options: { excluded: ['a'] },
			});
			result = expectRefusal(result);
		});

		it('picks the only eligible provider with `only-candidate`', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [make({ providerId: 'solo' })],
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('solo');
			expect(result.reason).toBe('only-candidate');
			expect(result.health).toBe('healthy');
		});

		it('picks the preferred provider on tie', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [
					make({ providerId: 'alpha', latencyMs: 100 }),
					make({ providerId: 'beta', latencyMs: 100 }),
				],
				options: { preferred: ['beta'] },
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('beta');
			expect(result.reason).toBe('preferred');
		});

		it('picks the cheaper provider when costs differ', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [
					make({
						providerId: 'expensive',
						cost: { tokensPer1k: 10 },
					}),
					make({ providerId: 'cheap', cost: { tokensPer1k: 1 } }),
				],
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('cheap');
		});

		it('failover to degraded when no healthy candidate is available', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [
					make({
						providerId: 'sick-a',
						health: 'down',
						latencyMs: 5000,
					}),
					make({
						providerId: 'sick-b',
						health: 'degraded',
						latencyMs: 500,
					}),
				],
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('sick-b');
			expect(result.reason).toBe('failover');
			expect(result.health).toBe('degraded');
		});

		it('returns a refusal when no provider has the capability', () => {
			let result = selectProvider({
				capability: 'embed',
				providers: [
					make({ providerId: 'a', capabilities: ['chat'] }),
					make({ providerId: 'b', capabilities: ['chat'] }),
				],
			});
			result = expectRefusal(result);
			expect(result.candidates).toEqual([]);
			expect(result.reasons).toContain('no-eligible-provider');
		});

		it('selection carries both providerId and a redactedId (R1.1)', () => {
			let result = selectProvider({
				capability: 'chat',
				providers: [make({ providerId: 'acme-mcp' })],
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('acme-mcp');
			expect(result.redactedId.startsWith('ext-mcp-')).toBe(true);
			// Same id redacts the same way (session-stable).
			expect(redactProviderId('acme-mcp')).toBe(result.redactedId);
		});

		it('is deterministic: same envelope ⇒ same selection', () => {
			const envelope = {
				capability: 'chat',
				providers: [
					make({ providerId: 'alpha', latencyMs: 60 }),
					make({ providerId: 'beta', latencyMs: 80 }),
				],
			};
			const a = selectProvider(envelope);
			const b = selectProvider(envelope);
			expect(a).toEqual(b);
		});
	});

	describe('selectWithFailover', () => {
		it('marks a non-preferred winner with reason `best-health` when preferred is sick', () => {
			let result = selectWithFailover({
				capability: 'chat',
				providers: [
					make({
						providerId: 'preferred',
						health: 'degraded',
						latencyMs: 500,
					}),
					make({
						providerId: 'healthy',
						health: 'healthy',
						latencyMs: 50,
					}),
				],
				options: { preferred: ['preferred'] },
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('healthy');
			expect(result.reason).toBe('best-health');
		});

		it('keeps the preferred choice when preferred is healthy', () => {
			let result = selectWithFailover({
				capability: 'chat',
				providers: [
					make({
						providerId: 'preferred',
						health: 'healthy',
						latencyMs: 50,
					}),
					make({
						providerId: 'other',
						health: 'healthy',
						latencyMs: 80,
					}),
				],
				options: { preferred: ['preferred'] },
			});
			result = expectSelection(result);
			expect(result.providerId).toBe('preferred');
		});
	});
});
