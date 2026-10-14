import { describe, expect, it } from 'vitest';

import { buildEscalationLadder } from '../../../../src/lib/escalate/build-ladder';
import type { IProviderCandidate } from '../../../../src/lib/contracts/interfaces/roster.interface';

const cand = (id: string, costTier: 1 | 2 | 3 | 4 | 5): IProviderCandidate => ({
	id,
	label: id,
	source: 'api',
	vendor: id,
	reach: `${id}_KEY`,
	costTier,
});

// A cheap-first ranked roster (what rankProviders returns at a cheap dial).
const ranked = [cand('cheap', 1), cand('mid', 3), cand('strong', 5)];

describe('buildEscalationLadder', () => {
	it('starts at the best-value pick and escalates to progressively stronger rungs', () => {
		const plan = buildEscalationLadder({ ranked });
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual([
			'cheap',
			'mid',
			'strong',
		]);
		expect(plan.ladder.map((r) => r.step)).toEqual([1, 2, 3]);
	});

	it('never escalates above the user cost ceiling', () => {
		const plan = buildEscalationLadder({ ranked, costCeiling: 3 });
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual([
			'cheap',
			'mid',
		]);
		expect(plan.ladder.every((r) => r.candidate.costTier <= 3)).toBe(true);
	});

	it('respects maxDepth (primary + escalations)', () => {
		const plan = buildEscalationLadder({ ranked, maxDepth: 2 });
		expect(plan.ladder).toHaveLength(2);
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual([
			'cheap',
			'mid',
		]);
	});

	it('climbs one tier-step at a time, cheapest-of-the-stronger first', () => {
		const roster = [
			cand('t1', 1),
			cand('t2a', 2),
			cand('t2b', 2),
			cand('t4', 4),
		];
		const plan = buildEscalationLadder({ ranked: roster, maxDepth: 10 });
		// t1 → cheapest stronger (t2a, tie broken by id) → next stronger (t4)
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual([
			't1',
			't2a',
			't4',
		]);
	});

	it('a single reachable provider yields a one-rung plan (nothing to escalate to)', () => {
		const plan = buildEscalationLadder({ ranked: [cand('only', 2)] });
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual(['only']);
	});

	it('an empty roster yields an empty ladder (no crash)', () => {
		const plan = buildEscalationLadder({ ranked: [] });
		expect(plan.ladder).toEqual([]);
	});

	it('when the recommended pick is over the ceiling, falls back to the cheapest within it', () => {
		// ranked strongest-first (a quality-leaning dial), ceiling caps at 2.
		const strongFirst = [
			cand('strong', 5),
			cand('mid', 3),
			cand('cheap', 1),
		];
		const plan = buildEscalationLadder({
			ranked: strongFirst,
			costCeiling: 2,
		});
		expect(plan.ladder.map((r) => r.candidate.id)).toEqual(['cheap']);
	});
});
