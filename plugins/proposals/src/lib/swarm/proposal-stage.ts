/**
 * proposal-stage.ts — where a proposal in review stands, read from the
 * `review-state` its slices already carry.
 *
 * A change request used to move the proposal out of `review/`, to
 * `ready`, as if it had never been delivered; a reviewer who saw the
 * queue unchanged then moved ten proposals again by hand. A proposal sent
 * back stays in `review/`: its sent-back slices read `pending` with
 * `review-state: changes_requested`, and the implementer fixes them there.
 * No new state is written: the queue, the status and the implementer's
 * next action all read these same fields, so nobody moves a file to say
 * what a verdict already said.
 */
import { parseReviewState, type IReviewStatus } from './proposal-review';

/** The slice blocks of `markdown`, frontmatter excluded so it cannot spoof one. */
const sliceBlocks = (markdown: string): readonly string[] =>
	markdown
		.replace(/^---[\s\S]*?---\s*/u, '')
		.split(/^### /mu)
		.slice(1);

const HANDED_IN = /^[-*]\s*(?:\*\*Status\*\*|status):\s*review\b/imu;

/**
 * One slice's review-state, a slice handed in with no round yet counted
 * as `in_review`: it waits for a verdict all the same.
 */
const reviewStateOfBlock = (block: string): IReviewStatus => {
	const status = parseReviewState(block).status;
	return status === 'none' && HANDED_IN.test(block) ? 'in_review' : status;
};

/**
 * The review-state of the proposal as a whole, in the slices' own words:
 * `in_review` while any slice waits for a verdict, `changes_requested`
 * when none waits and at least one was sent back, `done` when every slice
 * with a round is approved, `none` when no slice was handed in.
 */
export const proposalReviewState = (markdown: string): IReviewStatus => {
	const states = sliceBlocks(markdown).map(reviewStateOfBlock);
	if (states.includes('in_review')) return 'in_review';
	if (states.includes('changes_requested')) return 'changes_requested';
	return states.includes('done') ? 'done' : 'none';
};

/** Whether the proposal is sent back: its next step is its implementer's, not a reviewer's. */
export const isSentBack = (markdown: string): boolean =>
	proposalReviewState(markdown) === 'changes_requested';

/** The ids of the slices a reviewer sent back, as their headings spell them. */
export const sentBackSliceIds = (markdown: string): ReadonlySet<string> =>
	new Set(
		sliceBlocks(markdown)
			.filter(
				(block) => reviewStateOfBlock(block) === 'changes_requested',
			)
			.map((block) => block.split(/\s/u)[0] ?? ''),
	);

/** What happens next for a proposal sent back, said once for every reader. */
export const sentBackNextAction = (proposalId: string): string =>
	`${proposalId} stays in review/ with review-state changes_requested: the verdict is the move, and nothing is moved by hand. Its implementer (or whoever takes it) fixes each slice sent back and hands it in again with \`delendai work deliver --proposal=${proposalId}\`; a reviewer other than the last one verifies the fix.`;
