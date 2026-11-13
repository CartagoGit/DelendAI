/**
 * review-pack.service.ts — how full a review unit's pack is.
 *
 * A unit publishes its verdicts as one pull request once it holds a pack
 * of proposals; `review_queue` says how far along the caller's unit is.
 */
import { REVIEW_PACK_SIZE } from '../contracts/constants/review-claims.constant';
import type { IReviewClaimHolder } from '../contracts/interfaces/review-claim-holder.interface';
import type { IReviewPack } from '../contracts/interfaces/review-queue.interface';
import { publishPackStep } from './review-claim.service';

/** How full the caller's pack is: the proposals its unit has claimed. */
export const packOf = (
	claims: ReadonlyMap<string, readonly IReviewClaimHolder[]>,
	unit: string,
	prefix: string,
): IReviewPack => {
	const claimed = [...claims.values()].filter((holders) =>
		holders.some((holder) => holder.unit === unit),
	).length;
	const full = claimed >= REVIEW_PACK_SIZE;
	return {
		size: REVIEW_PACK_SIZE,
		claimed,
		full,
		...(full ? { next: publishPackStep(prefix) } : {}),
	};
};
