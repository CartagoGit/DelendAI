/**
 * publication-join.service.ts — a unit joins the open publication it is
 * about to push into.
 *
 * Slices of one small proposal share one publication ref, while each has
 * its own unit. The slice that publishes second finds the ref holding
 * commits its unit lacks; the push is then not a fast-forward. Merging
 * the publication into the unit is deterministic, so the product does it
 * instead of asking the agent (work model, rule 7). A merge that
 * conflicts is refused with the files named and the unit left as it was.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IPublicationJoin } from '../contracts/interfaces/publication-join.interface';
import { runGitCommand } from '../shared/git-command.helper';
import { worktreeOfRef } from './unit-removal.service';

const NOTHING_TO_JOIN: IPublicationJoin = { joined: false };

/** A merge commit needs an identity even where none is configured. */
const IDENTITY = [
	'-c',
	'user.name=delendai',
	'-c',
	'user.email=delendai@localhost',
];

const mergeIn = (
	cwd: string,
	publicationTip: string,
	publicationRef: string,
): IPublicationJoin => {
	const merged = runGitCommand(cwd, [
		...IDENTITY,
		'merge',
		'--no-edit',
		'--no-ff',
		'-m',
		`merge ${publicationRef}`,
		publicationTip,
	]);
	if (merged.ok) return { joined: true };
	const conflicting = runGitCommand(cwd, [
		'diff',
		'--name-only',
		'--diff-filter=U',
	]);
	runGitCommand(cwd, ['merge', '--abort']);
	const files = conflicting.ok
		? conflicting.out.split('\n').filter((file) => file.length > 0)
		: [];
	return {
		joined: false,
		refusal:
			files.length > 0
				? `This unit conflicts with the open publication \`${publicationRef}\` in: ${files.join(', ')}.`
				: `This unit could not be merged with the open publication \`${publicationRef}\`: ${merged.out}`,
	};
};

/**
 * Merge the remote publication ref into the work ref when it holds
 * commits the unit lacks. Nothing happens when the publication does not
 * exist, is already in the unit, or the unit is ahead of it (a plain
 * fast-forward push).
 */
export const joinOpenPublication = async (request: {
	readonly root: string;
	readonly workRef: string;
	readonly remote: string;
	readonly publicationRef: string;
}): Promise<IPublicationJoin> => {
	const { root, workRef, remote, publicationRef } = request;
	const unitTip = runGitCommand(root, [
		'rev-parse',
		'-q',
		'--verify',
		workRef,
	]);
	if (!unitTip.ok || unitTip.out.length === 0) return NOTHING_TO_JOIN;
	const listed = runGitCommand(root, [
		'ls-remote',
		'--',
		remote,
		publicationRef,
	]);
	if (!listed.ok || listed.out.length === 0) return NOTHING_TO_JOIN;
	const fetched = runGitCommand(root, [
		'fetch',
		'-q',
		'--no-tags',
		'--',
		remote,
		publicationRef,
	]);
	if (!fetched.ok) return NOTHING_TO_JOIN;
	const publicationTip = runGitCommand(root, ['rev-parse', 'FETCH_HEAD']);
	if (!publicationTip.ok) return NOTHING_TO_JOIN;
	const tip = publicationTip.out;
	const inUnit = runGitCommand(root, [
		'merge-base',
		'--is-ancestor',
		tip,
		unitTip.out,
	]);
	if (inUnit.ok) return NOTHING_TO_JOIN;
	const own = worktreeOfRef(root, workRef.replace(/^refs\/heads\//u, ''));
	if (own !== undefined) return mergeIn(own, tip, publicationRef);

	// A unit with no worktree is merged in a throwaway one, and its ref is
	// moved only if the ref still stands where it was read.
	const scratch = await mkdtemp(join(tmpdir(), 'publication-join-'));
	try {
		const added = runGitCommand(root, [
			'worktree',
			'add',
			'-q',
			'--detach',
			scratch,
			unitTip.out,
		]);
		if (!added.ok) return NOTHING_TO_JOIN;
		const result = mergeIn(scratch, tip, publicationRef);
		if (!result.joined) return result;
		const head = runGitCommand(scratch, ['rev-parse', 'HEAD']);
		const moved =
			head.ok &&
			runGitCommand(root, ['update-ref', workRef, head.out, unitTip.out])
				.ok;
		return moved
			? result
			: {
					joined: false,
					refusal: `${workRef} moved while it was being merged with \`${publicationRef}\`; publish again.`,
				};
	} finally {
		runGitCommand(root, ['worktree', 'remove', '--force', scratch]);
		await rm(scratch, { recursive: true, force: true });
	}
};
