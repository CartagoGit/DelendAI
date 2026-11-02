/**
 * selection-explain.service.ts — every selection answers why that route
 * was chosen, which ones were discarded and for what reason each.
 *
 * Pure: it rearranges what `preferRoute` already decided and decides
 * nothing itself.
 */
import type {
	ISelectionExplanation,
	ISelectionExplanationRow,
	ISelectionFallback,
} from '../contracts/interfaces/selection-explain.interface';
import type { IPreferenceOutcome, IRankedRoute } from './economic-preference';

const toRow = (entry: IRankedRoute): ISelectionExplanationRow => ({
	route: entry.route.identity,
	billing: entry.route.economics.billing,
	score: entry.score,
	components: entry.components,
	reasons: [...entry.reasons],
});

const sameRoute = (left: IRankedRoute, right?: IRankedRoute): boolean =>
	right !== undefined && left.route.identity === right.route.identity;

export const explainSelection = (
	outcome: IPreferenceOutcome,
	fallback?: ISelectionFallback,
): ISelectionExplanation => {
	const chosen = outcome.chosen;
	const ranked = outcome.ranked;
	return {
		reason: outcome.reason,
		...(chosen !== undefined ? { chosen: toRow(chosen) } : {}),
		discarded: ranked
			.filter((entry) => !sameRoute(entry, chosen))
			.map(toRow),
		metrics: {
			candidateCount: ranked.length,
			alreadyPaidCount: ranked.filter(
				(entry) => entry.route.economics.marginalCost === 0,
			).length,
			billedCount: ranked.filter(
				(entry) => entry.route.economics.marginalCost > 0,
			).length,
		},
		...(fallback === undefined
			? {}
			: {
					fallback: {
						order: fallback.order.map((route) => route.identity),
						reason: fallback.reason,
					},
				}),
	};
};
