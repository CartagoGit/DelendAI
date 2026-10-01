import type { IReviewIndependence } from '../contracts/interfaces/review-independence.interface';

/**
 * independent-approval.ts — the one rule for reaching `done`: every
 * finished slice carries an approval by someone other than its
 * implementer (x00718).
 *
 * `proposal_transition`, `proposal_force_transition` and CI's
 * `closed-with-independent-approval` each judged this their own way, and
 * a `force: true` or `skipPeerReview: true` skipped the tools' version.
 * On 2026-09-28 one agent closed about seventy proposals with
 * `skipPeerReview`, citing an owner's decision that was never taken. The
 * rule now lives here, every path to `done` applies it, and no flag an
 * agent can pass skips it. A project that does not review turns it off
 * in its own configuration (`requirePeerReview: false`).
 */

/** Whether `approver` approving `implementer`'s work is a self-approval. */
export const isSelfApproval = (
	implementer: string | undefined,
	approver: string,
	independence: IReviewIndependence = 'model',
): boolean =>
	independence === 'model' &&
	implementer !== undefined &&
	implementer.trim().toLowerCase() === approver.trim().toLowerCase();

/** The finished slices of `markdown` that lack an independent approval. */
export const unapprovedSlices = (
	markdown: string,
	independence: IReviewIndependence = 'model',
): readonly string[] => {
	// A slice is a `###` block with a Status line; other `###` headings
	// (notes, measurements) are not judged. A proposal with no slices is
	// judged as a whole. Both spellings of the review fields are in use
	// (`- review-log:` and `- **review-log**:`), so both are read.
	const statusOf = (block: string) =>
		block
			.match(/^[-*]\s*\*\*Status\*\*:\s*([a-z-]+)/imu)?.[1]
			?.toLowerCase();
	const slices = markdown
		.split(/^### /mu)
		.slice(1)
		.filter((block) => statusOf(block) !== undefined);
	const judged =
		slices.length > 0
			? slices.filter((block) => statusOf(block) === 'done')
			: [markdown];
	return judged.flatMap((block) => {
		const title =
			slices.length > 0 ? (block.split('\n')[0] ?? '').trim() : '';
		const implementer = block
			.match(/^[-*]\s*\*{0,2}review-implementer\*{0,2}:\s*(\S+)/imu)?.[1]
			?.toLowerCase();
		const approvers = [
			...block.matchAll(
				/^[-*]\s*\*{0,2}review-log\*{0,2}:\s*approved by\s+(\S+)/gimu,
			),
		].map((match) => (match[1] ?? '').toLowerCase());
		const independent = approvers.some(
			(approver) =>
				approver.length > 0 &&
				!isSelfApproval(implementer, approver, independence),
		);
		return independent ? [] : [title.length > 0 ? title : '(the proposal)'];
	});
};
