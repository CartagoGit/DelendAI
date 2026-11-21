/**
 * review-restore.ts — `proposal_reconcile_folder` with no id: return to
 * `review/` the proposals a reviewer moved out of it by hand after
 * sending them back, keeping the review-state their recorded verdicts
 * carry.
 *
 * A dry run by default, answered in the tool's own dry-run shape: each
 * proposal is a `rename` it would make, with its slices' review-state and
 * the reviewers that sent it back. Run, it changes each document's status
 * and folder only; the verdicts, the review-state lines and the
 * reviewer's units are read, never written.
 */
import { toolOk } from '@delendai/core/public';

import { findReviewRestoreCandidates } from '../services/review-restore.service';
/** The id the answer carries: every proposal the repair found. */
const ALL = 'all';

/**
 * `restore` is the recovery tools' own move of one proposal, still in
 * progress, to `review`; it answers whether it moved it.
 */
export const runProposalReviewRestore = async (
	args: { readonly dryRun?: boolean | undefined },
	proposalsDirAbs: string,
	restore: (id: string) => Promise<boolean>,
) => {
	const dryRun = args.dryRun !== false;
	const candidates = await findReviewRestoreCandidates(proposalsDirAbs);
	const wouldChange = candidates.map((candidate) => ({
		kind: 'rename' as const,
		path: candidate.file,
		summary: `${candidate.id} -> review (${candidate.slices
			.map((slice) => `${slice.sliceId} ${slice.reviewState}`)
			.join(', ')})${
			candidate.reviewers.length === 0
				? ''
				: `; sent back by ${candidate.reviewers.join(', ')}`
		}`,
	}));
	if (dryRun) {
		return toolOk({ ok: true, id: ALL, dryRun, wouldChange });
	}
	let moved = 0;
	for (const candidate of candidates) {
		if (await restore(candidate.id)) moved += 1;
	}
	return toolOk({
		ok: true,
		id: ALL,
		dryRun,
		changed: moved > 0,
		wouldChange,
		to: 'review',
	});
};
