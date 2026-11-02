/**
 * review-queue-summary.service.ts — the backlog in one sentence that says
 * what each number counts.
 *
 * `totals` counts slices for some fields and proposals for others, under
 * names that do not say which. On 2026-09-28 a reviewer read "5 ready to
 * close" as five slices beside "21 need a verdict" and "51 blocked", and
 * told the owner a picture of the backlog nobody could reconcile. The
 * summary names the unit of every figure.
 */
import type { IReviewQueueProposal } from '../contracts/interfaces/review-queue.interface';

const plural = (count: number, one: string, many: string): string =>
	`${String(count)} ${count === 1 ? one : many}`;

export const summarizeQueue = (
	reviewed: readonly IReviewQueueProposal[],
): string => {
	const withSlice = (verdict: string) =>
		reviewed.filter((proposal) =>
			proposal.slices.some((slice) => slice.verdict === verdict),
		);
	const slicesWith = (verdict: string) =>
		reviewed
			.flatMap((proposal) => proposal.slices)
			.filter((slice) => slice.verdict === verdict).length;
	const slices = reviewed.reduce((sum, p) => sum + p.slices.length, 0);
	const ready = reviewed.filter((proposal) => proposal.close !== undefined);
	return [
		`${plural(reviewed.length, 'proposal', 'proposals')} in review (${plural(slices, 'slice', 'slices')})`,
		`${plural(slicesWith('needs-verdict'), 'slice needs', 'slices need')} a verdict, in ${plural(withSlice('needs-verdict').length, 'proposal', 'proposals')}`,
		`${plural(slicesWith('blocked'), 'slice is', 'slices are')} blocked, in ${plural(withSlice('blocked').length, 'proposal', 'proposals')}`,
		`${plural(ready.length, 'proposal is', 'proposals are')} approved and ready to close`,
	].join('; ');
};
