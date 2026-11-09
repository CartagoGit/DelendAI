/**
 * Shapes of an explained route selection: what each part of a score
 * contributed, which route won and why every other one did not.
 */
import type { IRoute } from '../../routing/route-identity';

/** A score kept as its parts, so no reader has to trust an opaque sum. */
export interface IRouteScoreComponents {
	readonly qualityEvidence: number;
	readonly alreadyPaidBonus: number;
	readonly scarcityPenalty: number;
	readonly headroomTiebreak: number;
	readonly total: number;
}

export interface ISelectionFallback {
	readonly order: readonly IRoute[];
	readonly reason: string;
}

export interface ISelectionExplanationRow {
	readonly route: string;
	readonly billing: string;
	readonly score: number;
	readonly components: IRouteScoreComponents;
	readonly reasons: readonly string[];
}

export interface ISelectionExplanation {
	readonly reason: string;
	readonly chosen?: ISelectionExplanationRow | undefined;
	readonly discarded: readonly ISelectionExplanationRow[];
	readonly metrics: {
		readonly candidateCount: number;
		readonly alreadyPaidCount: number;
		readonly billedCount: number;
	};
	readonly fallback?:
		| {
				readonly order: readonly string[];
				readonly reason: string;
		  }
		| undefined;
}
