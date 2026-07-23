import { describe, expect, it } from 'vitest';

import { rankProviders } from '../../../../src/lib/routing/rank-providers';
import type { IProviderCandidate } from '../../../../src/lib/contracts/interfaces/roster.interface';

const cand = (id: string, costTier: 1 | 2 | 3 | 4 | 5): IProviderCandidate => ({
	id,
	label: id,
	source: 'api',
	vendor: id,
	reach: `${id.toUpperCase()}_KEY`,
	costTier,
});

const cheap = cand('cheap', 1);
const mid = cand('mid', 3);
const strong = cand('strong', 5);
const roster = [strong, cheap, mid]; // deliberately unsorted

describe('rankProviders', () => {
	it('dial 10 (cheapest) ranks the cheapest provider first', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 10,
		});
		expect(ranked[0]?.candidate.id).toBe('cheap');
	});

	it('dial 0 (strongest) ranks the most capable provider first', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 0,
		});
		expect(ranked[0]?.candidate.id).toBe('strong');
	});

	it('is MONOTONIC: leaning cheaper (dial 7) never ranks a pricier provider above a cheaper one', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 7,
		});
		expect(ranked.map((r) => r.candidate.id)).toEqual([
			'cheap',
			'mid',
			'strong',
		]);
	});

	it('is MONOTONIC the other way: leaning stronger (dial 3) never ranks a cheaper provider above a pricier one', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 3,
		});
		expect(ranked.map((r) => r.candidate.id)).toEqual([
			'strong',
			'mid',
			'cheap',
		]);
	});

	it('dial 5 is neutral — ties break cheapest-first', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 5,
		});
		expect(ranked.map((r) => r.candidate.id)).toEqual([
			'cheap',
			'mid',
			'strong',
		]);
	});

	it('a REACHABLE pin always ranks first, whatever the dial says', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 10, // would otherwise pick `cheap`
			pinnedId: 'strong',
		});
		expect(ranked[0]?.candidate.id).toBe('strong');
		expect(ranked[0]?.pinned).toBe(true);
		expect(ranked[0]?.rationale).toContain('pinned');
	});

	it('an UNREACHABLE pin is ignored — normal ranking, nothing marked pinned', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 10,
			pinnedId: 'not-in-roster',
		});
		expect(ranked[0]?.candidate.id).toBe('cheap');
		expect(ranked.every((r) => !r.pinned)).toBe(true);
	});

	it('every row carries a non-empty rationale', () => {
		const ranked = rankProviders({
			available: roster,
			costQualityTradeoff: 5,
		});
		for (const r of ranked) expect(r.rationale.length).toBeGreaterThan(0);
	});

	it('is stable + total: returns every candidate, empty in → empty out', () => {
		expect(
			rankProviders({ available: [], costQualityTradeoff: 5 }),
		).toEqual([]);
		expect(
			rankProviders({ available: roster, costQualityTradeoff: 3 }),
		).toHaveLength(3);
	});
});
