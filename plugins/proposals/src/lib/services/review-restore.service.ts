/**
 * review-restore.service.ts — the proposals a reviewer moved out of
 * review by hand, found from what their documents record.
 *
 * A change request leaves a proposal in `review/` with its slices'
 * `review-state: changes_requested`. Before that rule, the verdict moved
 * it to `ready/`, and a reviewer then forced ten of them on to
 * `in-progress/`: the forced move rewrote the status and nothing else.
 * Each still has every slice handed in (a round on each, or closed), its
 * slices waiting for a verdict or sent back with `review-state:
 * changes_requested`, and none taken up since. Those facts, read from the
 * document alone, name what to restore; nothing here reads or writes the
 * reviewer's unit or verdicts. An implementer that re-entered the
 * proposal through `work deliver` holds it in progress only while its
 * proof runs, and is listed like any other: the dry run is the default.
 */
import { join } from 'node:path';

import { safeListDir } from '@delendai/core/public';

import { readTextOrNull } from '../proposals/index-reader';
import { readFrontmatterField } from '../proposals/proposal-frontmatter-writer';
import { parseReviewState } from '../swarm/proposal-review';
import { proposalReviewState } from '../swarm/proposal-stage';
import type { IReviewRestoreCandidate } from '../contracts/interfaces/review-restore.interface';

export type { IReviewRestoreCandidate } from '../contracts/interfaces/review-restore.interface';

/** A slice closed without a round of its own. */
const CLOSED = /^[-*]\s*(?:\*\*Status\*\*|status):\s*(?:done|retired)\b/imu;

/** A slice taken up again since: its implementer has the proposal. */
const TAKEN_UP = /^[-*]\s*(?:\*\*Status\*\*|status):\s*in-progress\b/imu;

/** What the document records, as a restore candidate, or why it is not one. */
export const restoreCandidateOf = (
	file: string,
	markdown: string,
): IReviewRestoreCandidate | undefined => {
	const id = readFrontmatterField(markdown, 'id');
	const status = readFrontmatterField(markdown, 'status')?.toLowerCase();
	if (id === undefined || status !== 'in-progress') return undefined;
	const state = proposalReviewState(markdown);
	if (state !== 'changes_requested' && state !== 'in_review')
		return undefined;
	const blocks = markdown
		.replace(/^---[\s\S]*?---\s*/u, '')
		.split(/^### /mu)
		.slice(1);
	if (blocks.some((block) => TAKEN_UP.test(block))) return undefined;
	// Every slice was handed in: each carries a round, or was closed.
	if (
		blocks.some(
			(block) =>
				parseReviewState(block).status === 'none' &&
				!CLOSED.test(block),
		)
	) {
		return undefined;
	}
	const slices = blocks.flatMap((block) => {
		const state = parseReviewState(block);
		return state.status === 'none'
			? []
			: [
					{
						sliceId: block.split(/\s/u)[0] ?? '',
						reviewState: state.status,
					},
				];
	});
	const reviewers = [
		...new Set(
			blocks.flatMap((block) =>
				parseReviewState(block)
					.rounds.filter(
						(round) => round.verdict === 'requested_changes',
					)
					.map((round) => round.agent),
			),
		),
	].sort();
	return { id, file, from: status, slices, reviewers };
};

/** Every proposal in `in-progress/` that its recorded verdicts say belongs in review. */
export const findReviewRestoreCandidates = async (
	proposalsDirAbs: string,
): Promise<readonly IReviewRestoreCandidate[]> => {
	const listed = await safeListDir(join(proposalsDirAbs, 'in-progress'));
	const names = listed.entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => entry.name)
		.sort();
	const found: IReviewRestoreCandidate[] = [];
	for (const name of names) {
		const file = `in-progress/${name}`;
		const markdown = await readTextOrNull(join(proposalsDirAbs, file));
		const candidate =
			markdown === null ? undefined : restoreCandidateOf(file, markdown);
		if (candidate !== undefined) found.push(candidate);
	}
	return found;
};
