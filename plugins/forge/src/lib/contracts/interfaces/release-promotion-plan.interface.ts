/**
 * Contract shapes for the release promotion plan.
 */
import type { IReleasePrResult } from '../../release-pr';

/** What reaching the release branch takes, given how the project integrates. */
export type IReleasePromotionPlan =
	| { readonly kind: 'none'; readonly reason: string }
	| { readonly kind: 'pull-request'; readonly result: IReleasePrResult }
	| {
			readonly kind: 'merge' | 'direct';
			readonly headBranch: string;
			readonly baseBranch: string;
	  };
