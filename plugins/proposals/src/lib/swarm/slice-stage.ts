/**
 * slice-stage.ts — how far a slice has got, from what is already recorded.
 *
 * A slice carries one `Status` word, a `review-state`, maybe a
 * `shipped-in`, and its commit is or is not on the integration and
 * release branches. Read one at a time, a slice finished and waiting for
 * its reviewer read `pending`. The stage puts those facts in one order;
 * nothing new is written, and the review stages keep the review-state's
 * own words.
 */
import type {
	ISliceFacts,
	ISliceStage,
} from '../contracts/interfaces/slice-stage.interface';

export type {
	ISliceFacts,
	ISliceStage,
} from '../contracts/interfaces/slice-stage.interface';

/** The stage the facts say a slice has reached. */
export const sliceStage = (facts: ISliceFacts): ISliceStage => {
	const status = facts.status.toLowerCase();
	if (status === 'retired') return 'retired';
	const approved = facts.reviewState === 'done' || status === 'done';
	if (approved && facts.released) return 'released';
	if (approved) return facts.integrated ? 'integrated' : 'reviewed';
	if (facts.reviewState === 'changes_requested') return 'changes_requested';
	if (facts.reviewState === 'in_review' || status === 'review') {
		return 'in_review';
	}
	if (facts.proved) return 'proved';
	if (facts.delivered) return 'implemented';
	return status === 'in-progress' ? 'in-progress' : 'pending';
};

/** How many slices stand at each stage, in first-seen order: `in_review 2, pending 1`. */
export const stageCounts = (stages: readonly ISliceStage[]): string => {
	const counts = new Map<ISliceStage, number>();
	for (const stage of stages) counts.set(stage, (counts.get(stage) ?? 0) + 1);
	return [...counts]
		.map(([stage, count]) => `${stage} ${String(count)}`)
		.join(', ');
};
