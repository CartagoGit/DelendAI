import { describe, expect, it } from 'vitest';

import { buildDashboard } from '../../../../src/lib/dashboard/view-model';
import type { IProviderCandidate } from '../../../../src/lib/contracts/interfaces/roster.interface';
import type { IRecommendationRow } from '../../../../src/lib/contracts/interfaces/dashboard.interface';
import type { IRankedProvider } from '../../../../src/lib/contracts/interfaces/ranking.interface';

const cand = (
	id: string,
	costTier: 1 | 2 | 3 | 4 | 5,
	source: 'cli' | 'api' = 'api',
): IProviderCandidate => ({
	id,
	label: id,
	source,
	vendor: id,
	reach: `${id.toUpperCase()}_KEY`,
	costTier,
});

const ranked = (
	candidate: IProviderCandidate,
	rationale = 'best value',
): IRankedProvider => ({
	candidate,
	score: 0,
	rationale,
	pinned: false,
});

const rec = (
	taskType: string,
	ids: readonly string[],
	candidates: readonly IProviderCandidate[],
	pinnedId?: string,
): IRecommendationRow => ({
	taskType,
	dial: 7,
	ranked: ids
		.map((id) => candidates.find((c) => c.id === id))
		.filter((c): c is IProviderCandidate => c !== undefined)
		.map((c) => ranked(c)),
	pinnedId,
});

const spendRow = (providerId: string, costUsd: number, calls = 1) => ({
	providerId,
	costUsd,
	calls,
});

describe('f00140 S1 buildDashboard (pure)', () => {
	const cheap = cand('cheap', 1);
	const mid = cand('mid', 3);
	const strong = cand('strong', 5);
	const roster = [cheap, mid, strong];

	it('returns one row per union of roster + spend', () => {
		const vm = buildDashboard({
			available: roster,
			recommendations: [],
			spend: {
				providers: [
					spendRow('cheap', 0.05),
					spendRow('mid', 0.1),
					spendRow('orphan', 0.2), // spend-only, not in roster
				],
				windowLabel: 'last 7 days',
			},
		});
		expect(vm.rows.map((r) => r.providerId)).toEqual([
			'cheap',
			'mid',
			'strong',
			'orphan',
		]);
	});

	it('surfaces spend-only providers with the matching note', () => {
		const vm = buildDashboard({
			available: roster,
			recommendations: [],
			spend: {
				providers: [spendRow('orphan', 0.42, 3)],
				windowLabel: 'last 7 days',
			},
		});
		const orphan = vm.rows.find((r) => r.providerId === 'orphan');
		expect(orphan).toBeDefined();
		expect(orphan?.spendUsd).toBe(0.42);
		expect(orphan?.calls).toBe(3);
		expect(orphan?.bestRank).toBeNull();
		expect(orphan?.note).toBe('spend recorded but not in current roster');
	});

	it('sorts pinned providers first', () => {
		const vm = buildDashboard({
			available: roster,
			recommendations: [
				rec('code-edit', ['cheap', 'mid', 'strong'], roster, 'strong'),
			],
			spend: { providers: [], windowLabel: 'last 7 days' },
		});
		expect(vm.rows[0]?.providerId).toBe('strong');
		expect(vm.rows[0]?.pinned).toBe(true);
	});

	it('orders by best rank when nothing is pinned', () => {
		const vm = buildDashboard({
			available: roster,
			recommendations: [
				rec('code-edit', ['strong', 'mid', 'cheap'], roster),
				rec('review', ['mid', 'cheap', 'strong'], roster),
			],
			spend: { providers: [], windowLabel: 'last 7 days' },
		});
		// mid is ranked #1 in review → bestRank=1 → first.
		expect(vm.rows[0]?.providerId).toBe('mid');
		expect(vm.rows[0]?.bestRank).toBe(1);
	});

	it('falls back to costTier ASC when bestRank ties', () => {
		// Both reachable but neither ranked: bestRank is null for both, so
		// the costTier tiebreaker kicks in.
		const vm = buildDashboard({
			available: [cheap, mid, strong],
			recommendations: [],
			spend: { providers: [], windowLabel: 'last 7 days' },
		});
		expect(vm.rows.map((r) => r.providerId)).toEqual([
			'cheap',
			'mid',
			'strong',
		]);
	});

	it('summarises totals and headline', () => {
		const vm = buildDashboard({
			available: roster,
			recommendations: [
				rec('code-edit', ['cheap', 'mid'], roster, 'cheap'),
			],
			spend: {
				providers: [
					spendRow('cheap', 0.1, 4),
					spendRow('mid', 0.05, 2),
				],
				windowLabel: 'last 30 days',
			},
		});
		expect(vm.totalSpendUsd).toBeCloseTo(0.15);
		expect(vm.totalCalls).toBe(6);
		expect(vm.windowLabel).toBe('last 30 days');
		expect(vm.headline).toBe(
			'3 reachable · 1 task type · $0.15 this window · 6 calls',
		);
	});

	it('is pure: same input → same output', () => {
		const input = {
			available: roster,
			recommendations: [
				rec('code-edit', ['strong', 'mid', 'cheap'], roster),
			],
			spend: {
				providers: [spendRow('cheap', 0.01, 1)],
				windowLabel: 'last 7 days',
			},
		};
		const a = buildDashboard(input);
		const b = buildDashboard(input);
		expect(a).toEqual(b);
	});

	it('produces a stable order across runs (id tiebreaker)', () => {
		const a = buildDashboard({
			available: [cheap, mid, strong],
			recommendations: [],
			spend: { providers: [], windowLabel: 'last 7 days' },
		});
		const b = buildDashboard({
			available: [strong, mid, cheap], // reversed on purpose
			recommendations: [],
			spend: { providers: [], windowLabel: 'last 7 days' },
		});
		expect(a.rows.map((r) => r.providerId)).toEqual(
			b.rows.map((r) => r.providerId),
		);
	});

	it('handles a missing label gracefully (spend-only provider)', () => {
		const vm = buildDashboard({
			available: [],
			recommendations: [],
			spend: {
				providers: [spendRow('legacy-cli', 0.99, 7)],
				windowLabel: 'last 7 days',
			},
		});
		expect(vm.rows).toHaveLength(1);
		const only = vm.rows[0];
		expect(only?.label).toBe('legacy-cli'); // falls back to id
		expect(only?.costTier).toBe(3); // safe default
	});
});
