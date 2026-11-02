/**
 * auto-compaction-policy.spec.ts — q00014 S6.
 *
 * Two properties, and the second is the one the slice exists for.
 *
 * The policy has to fire on the shapes a long session actually takes —
 * not only "the tail got big", which is the one case an agent notices
 * on its own, but a window that is nearly spent and a single topic that
 * has taken the context over.
 *
 * And a compaction nobody asked for must not be allowed to lose what a
 * compaction somebody asked for may. That asymmetry is the whole
 * safety argument: the advisory path reports its losses to a caller who
 * can see them; the automatic path has no such reader.
 */

import { describe, expect, it } from 'vitest';

import {
	decideAutoCompaction,
	judgeCompactedSummary,
} from '../../../../src/lib/compaction/auto-compaction-policy.helper';
import { verifySummaryPreserves } from '../../../../src/lib/compaction/preserve-rules.helper';

describe('deciding to compact without being asked', () => {
	it('holds off while nothing is under pressure', () => {
		const decision = decideAutoCompaction({
			carriedTailTokens: 900,
			turnsSinceLastCompaction: 3,
		});

		expect(decision.shouldCompact).toBe(false);
		expect(decision.trigger).toBe('below-threshold');
		// Nothing fired, so nothing is bound: `binding` is a property of
		// the decision, not a global setting.
		expect(decision.binding).toBe(false);
	});

	it('fires on a tail that has already grown too big', () => {
		const decision = decideAutoCompaction({
			carriedTailTokens: 8_000,
			turnsSinceLastCompaction: 1,
		});

		expect(decision.trigger).toBe('token-threshold');
		expect(decision.binding).toBe(true);
	});

	it('fires on a nearly spent window even when the tail looks healthy', () => {
		// The absolute thresholds are blind to window size: a host with a
		// small window is in trouble at a tail the default calls fine.
		const decision = decideAutoCompaction({
			carriedTailTokens: 2_000,
			turnsSinceLastCompaction: 2,
			contextBudgetTokens: 16_000,
			contextUsedTokens: 12_000,
		});

		expect(decision.trigger).toBe('budget-pressure');
		expect(decision.hint).toContain('75%');
	});

	it('needs both halves of the budget before it will use either', () => {
		const decision = decideAutoCompaction({
			carriedTailTokens: 2_000,
			turnsSinceLastCompaction: 2,
			contextBudgetTokens: 16_000,
		});

		// A ratio built from one half is a number nobody can audit.
		expect(decision.shouldCompact).toBe(false);
	});

	it('fires when one topic has taken the context over', () => {
		const decision = decideAutoCompaction({
			carriedTailTokens: 1_200,
			turnsSinceLastCompaction: 4,
			largestTopicItems: 9,
			totalItems: 12,
		});

		expect(decision.trigger).toBe('topic-saturation');
	});

	it('ignores a dominant topic in a conversation that just started', () => {
		// Two items out of three is a ratio of 0.67 and means nothing.
		const decision = decideAutoCompaction({
			carriedTailTokens: 100,
			turnsSinceLastCompaction: 1,
			largestTopicItems: 2,
			totalItems: 3,
		});

		expect(decision.shouldCompact).toBe(false);
	});

	it('prefers the most direct evidence when several triggers apply', () => {
		const decision = decideAutoCompaction({
			carriedTailTokens: 9_000,
			turnsSinceLastCompaction: 40,
			contextBudgetTokens: 10_000,
			contextUsedTokens: 9_500,
			largestTopicItems: 20,
			totalItems: 20,
		});

		// A tail that is already too big is a fact; the others are a
		// measurement, a proxy and a shape.
		expect(decision.trigger).toBe('token-threshold');
	});

	it('takes the thresholds it is given', () => {
		expect(
			decideAutoCompaction(
				{ carriedTailTokens: 500, turnsSinceLastCompaction: 0 },
				{ tokenThreshold: 400 },
			).trigger,
		).toBe('token-threshold');
	});
});

describe('whether a summary may replace the tail it summarises', () => {
	const SOURCE = [
		'The user decided we ship the SQLite cutover before the UI work.',
		'The report must never contain source code.',
		'The root cause was a stale index, not a race.',
		'Fixed in 4f1c0aa and tracked as x00542.',
	].join('\n');

	it('accepts a summary that carries everything load-bearing', () => {
		const verdict = verifySummaryPreserves({
			source: SOURCE,
			summary: SOURCE,
		});

		const acceptance = judgeCompactedSummary({ binding: true, verdict });
		expect(acceptance.accept).toBe(true);
		expect(acceptance.wouldLose).toBe(0);
	});

	it('refuses an automatic compaction that would drop a constraint', () => {
		const verdict = verifySummaryPreserves({
			source: SOURCE,
			summary: 'We talked about the cutover and fixed a bug.',
		});

		const acceptance = judgeCompactedSummary({ binding: true, verdict });
		expect(acceptance.accept).toBe(false);
		expect(acceptance.wouldLose).toBeGreaterThan(0);
		expect(acceptance.reason).toContain('nobody asked');
		expect(acceptance.nextAction).toContain('Keep the tail');
	});

	it('lets a compaction the caller asked for proceed and say what it lost', () => {
		// The same summary, the same losses, a different answer — because
		// somebody is reading the result and chose to compact.
		const verdict = verifySummaryPreserves({
			source: SOURCE,
			summary: 'We talked about the cutover and fixed a bug.',
		});

		const acceptance = judgeCompactedSummary({ binding: false, verdict });
		expect(acceptance.accept).toBe(true);
		expect(acceptance.wouldLose).toBeGreaterThan(0);
		expect(acceptance.reason).toContain('advisory');
	});
});
