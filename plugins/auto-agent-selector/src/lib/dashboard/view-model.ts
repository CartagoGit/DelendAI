/**
 * view-model.ts — pure `buildDashboard(roster, recommendations, spend)` for
 * the router cost + recommendation dashboard (f00140 S1).
 *
 * SRP: turn three already-computed inputs into a flat renderable row list +
 * a one-line headline. NO I/O, no clock, no globals — the same inputs always
 * produce the same rows, so the CLI (S2) and the VS Code extension panel
 * (S3) render identical text without sharing state.
 *
 * Sort order is intentional:
 *   1. Pinned providers first (the user's pin is the loudest signal).
 *   2. Reachable providers by best rank across all task types
 *      (the router's strongest signal for each row).
 *   3. Spend-only providers last (the dashboard surfaces spend even when the
 *      router would not have picked them — "the router did not pick this but
 *      it ran" is a real, useful signal).
 *
 * Ties break by `costTier` ASC (cheapest first) then by `providerId` ASC for
 * a stable, reproducible order.
 */
import type { IProviderCandidate } from '../contracts/interfaces/roster.interface';
import type {
	IBuildDashboardInput,
	IDashboardRow,
	IDashboardViewModel,
	IRecommendationRow,
} from '../contracts/interfaces/dashboard.interface';

/**
 * 1-based rank of the provider within ONE recommendation. `null` when the
 * provider is not in that recommendation's reachable set.
 */
const rankForProvider = (
	rec: IRecommendationRow,
	providerId: string,
): number | null => {
	const index = rec.ranked.findIndex((r) => r.candidate.id === providerId);
	return index < 0 ? null : index + 1;
};

/** Smallest 1-based rank across all recommendations (best placement). */
const bestRankFor = (
	recommendations: readonly IRecommendationRow[],
	providerId: string,
): number | null => {
	let best: number | null = null;
	for (const rec of recommendations) {
		const r = rankForProvider(rec, providerId);
		if (r === null) continue;
		if (best === null || r < best) best = r;
	}
	return best;
};

const noteFor = (args: {
	readonly providerId: string;
	readonly inRoster: boolean;
	readonly bestRank: number | null;
	readonly pinned: boolean;
	readonly spendUsd: number;
}): string => {
	if (args.pinned) return 'pinned by you — always used';
	if (!args.inRoster && args.spendUsd > 0) {
		return 'spend recorded but not in current roster';
	}
	if (args.inRoster && args.bestRank !== null) {
		return `best rank #${args.bestRank} across task types`;
	}
	if (args.inRoster && args.spendUsd > 0) {
		return 'reachable but not yet ranked for any task type';
	}
	if (args.inRoster) {
		return 'reachable — no recorded spend in this window';
	}
	return 'not reachable in current roster';
};

const sortRows = (
	a: IDashboardRow,
	b: IDashboardRow,
	inRoster: ReadonlyMap<string, boolean>,
): number => {
	// 1. Pinned first.
	if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
	// 2. Reachable-with-rank next: lower bestRank wins, null sinks to the bottom.
	const ar = a.bestRank;
	const br = b.bestRank;
	if (ar !== br) {
		if (ar === null) return 1;
		if (br === null) return -1;
		return ar - br;
	}
	// 3. Then reachable-in-roster wins over spend-only (both have null bestRank).
	const aIn = inRoster.get(a.providerId) === true ? 1 : 0;
	const bIn = inRoster.get(b.providerId) === true ? 1 : 0;
	if (aIn !== bIn) return bIn - aIn;
	// 4. Then cost tier ASC (cheapest first).
	if (a.costTier !== b.costTier) return a.costTier - b.costTier;
	// 5. Stable id tiebreaker.
	return a.providerId.localeCompare(b.providerId);
};

/**
 * Pure: build a flat, renderable row list + headline from the inputs.
 * Stable order (pinned → ranked → spend-only); same input → same output.
 */
export const buildDashboard = (
	input: IBuildDashboardInput,
): IDashboardViewModel => {
	const rosterById = new Map<string, IProviderCandidate>(
		input.available.map((c) => [c.id, c]),
	);
	const spendById = new Map<string, { costUsd: number; calls: number }>();
	for (const s of input.spend.providers) {
		spendById.set(s.providerId, { costUsd: s.costUsd, calls: s.calls });
	}

	// Every provider the dashboard should show: union of roster + spend.
	const ids = new Set<string>([...rosterById.keys(), ...spendById.keys()]);

	const pinnedIds = new Set<string>();
	for (const rec of input.recommendations) {
		if (rec.pinnedId !== undefined) pinnedIds.add(rec.pinnedId);
	}

	const rows: IDashboardRow[] = [];
	let totalSpendUsd = 0;
	let totalCalls = 0;

	for (const providerId of ids) {
		const candidate = rosterById.get(providerId);
		const spend = spendById.get(providerId) ?? { costUsd: 0, calls: 0 };
		const bestRank = bestRankFor(input.recommendations, providerId);
		const pinned = pinnedIds.has(providerId);
		const row: IDashboardRow = {
			providerId,
			label: candidate?.label ?? providerId,
			source: candidate?.source ?? 'cli',
			costTier: candidate?.costTier ?? 3,
			pinned,
			bestRank,
			spendUsd: spend.costUsd,
			calls: spend.calls,
			note: noteFor({
				providerId,
				inRoster: candidate !== undefined,
				bestRank,
				pinned,
				spendUsd: spend.costUsd,
			}),
		};
		rows.push(row);
		totalSpendUsd += spend.costUsd;
		totalCalls += spend.calls;
	}

	const inRoster = new Map<string, boolean>();
	for (const r of rows)
		inRoster.set(r.providerId, rosterById.has(r.providerId));
	rows.sort((a, b) => sortRows(a, b, inRoster));

	const headlineParts = [
		`${input.available.length} reachable`,
		`${input.recommendations.length} task type${
			input.recommendations.length === 1 ? '' : 's'
		}`,
		`$${totalSpendUsd.toFixed(2)} this window`,
		`${totalCalls} call${totalCalls === 1 ? '' : 's'}`,
	];

	return {
		windowLabel: input.spend.windowLabel,
		headline: headlineParts.join(' · '),
		totalSpendUsd,
		totalCalls,
		rows,
	};
};
