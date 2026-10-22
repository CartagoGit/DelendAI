/**
 * proposal-slices-view.service.ts — the compact view of a proposal's
 * slices: what an agent reads instead of the document.
 */
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';

/** A slice in one of these is delivered or dropped: nothing left to read. */
const DELIVERED_SLICE_STATUSES: ReadonlySet<string> = new Set([
	'done',
	'review',
	'retired',
]);

/**
 * Every slice of the document with the status it writes; a slice still
 * open also carries what it waits on, the files it changes and the
 * acceptance left, cut by the one slice parser.
 */
export const slicesViewOf = (
	proposalId: string,
	markdown: string,
): {
	id: string;
	status: string;
	title: string;
	dependsOn?: string[];
	files?: string[];
	acceptance?: string[];
}[] =>
	(parseProposalSlicePlan(proposalId, markdown)?.slices ?? []).map(
		(slice) => {
			const written = slice.documentStatus ?? slice.status;
			return {
				id: slice.sliceId,
				status: written,
				title: slice.title,
				...(DELIVERED_SLICE_STATUSES.has(written)
					? {}
					: {
							dependsOn: [...slice.dependsOn],
							files: [...slice.files],
							acceptance: [...slice.acceptanceCriteria],
						}),
			};
		},
	);
