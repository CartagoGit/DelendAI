/**
 * compaction-trigger.spec.ts (f00090 S2)
 *
 * The trigger must be PURE and DETERMINISTIC, fire when EITHER the carried
 * tail crosses the token budget OR enough turns have elapsed, resolve the
 * reason tie-break toward token pressure, and honour custom thresholds.
 */
import { describe, expect, it } from 'vitest';

import { evaluateCompactionTrigger } from '@mcp-vertex/memory/lib/services/compaction-trigger';

describe('evaluateCompactionTrigger (f00090 S2)', () => {
	it('does not fire below both thresholds', () => {
		const d = evaluateCompactionTrigger({
			carriedTailTokens: 1000,
			turnsSinceLastCompaction: 3,
		});
		expect(d.shouldCompact).toBe(false);
		expect(d.reason).toBe('below-threshold');
		expect(d.hint).toContain('No compaction needed');
	});

	it('fires on the token threshold and reports token-threshold', () => {
		const d = evaluateCompactionTrigger({
			carriedTailTokens: 8000,
			turnsSinceLastCompaction: 1,
		});
		expect(d.shouldCompact).toBe(true);
		expect(d.reason).toBe('token-threshold');
		expect(d.hint).toContain('memory_compact');
	});

	it('fires on the turn threshold when tokens are still low', () => {
		const d = evaluateCompactionTrigger({
			carriedTailTokens: 10,
			turnsSinceLastCompaction: 25,
		});
		expect(d.shouldCompact).toBe(true);
		expect(d.reason).toBe('turn-threshold');
	});

	it('token pressure wins the reason tie-break when both trip', () => {
		const d = evaluateCompactionTrigger({
			carriedTailTokens: 20000,
			turnsSinceLastCompaction: 100,
		});
		expect(d.shouldCompact).toBe(true);
		expect(d.reason).toBe('token-threshold');
	});

	it('honours custom thresholds', () => {
		const d = evaluateCompactionTrigger(
			{ carriedTailTokens: 500, turnsSinceLastCompaction: 2 },
			{ tokenThreshold: 400, turnThreshold: 10 },
		);
		expect(d.shouldCompact).toBe(true);
		expect(d.reason).toBe('token-threshold');
		expect(d.tokenThreshold).toBe(400);
		expect(d.turnThreshold).toBe(10);
	});

	it('is pure: identical input yields an identical decision', () => {
		const signal = { carriedTailTokens: 9000, turnsSinceLastCompaction: 4 };
		expect(evaluateCompactionTrigger(signal)).toEqual(
			evaluateCompactionTrigger(signal),
		);
	});

	it('clamps negative inputs to zero', () => {
		const d = evaluateCompactionTrigger({
			carriedTailTokens: -50,
			turnsSinceLastCompaction: -3,
		});
		expect(d.carriedTailTokens).toBe(0);
		expect(d.turnsSinceLastCompaction).toBe(0);
		expect(d.shouldCompact).toBe(false);
	});
});
