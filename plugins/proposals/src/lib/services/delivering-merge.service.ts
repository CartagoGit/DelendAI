/**
 * delivering-merge.service.ts — the merge that brought a commit into the
 * integration branch, and what it delivered.
 *
 * A pull request is delivered whole. The commit a merge names is the
 * branch's tip, and the queue's refresh ("recompute after refreshing the
 * candidate") is often that tip: judged alone it touched no declared file,
 * and every proposal delivered through a refreshed pull request read as
 * blocked (x00744). What the merge brought is the delivery.
 */
import type { IGitRunner } from '../shared/git-runner';

const read = async (
	run: IGitRunner,
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output : undefined;
};

/**
 * The merge on the integration branch's first-parent line that brought
 * the commit in, or `undefined` when none did (a squash, a rebase, a
 * fast-forward).
 *
 * Containment is monotonic along that line — once a merge has the commit
 * in its history, every later one does too — so the delivering merge is
 * found by bisection rather than by asking about every merge.
 */
export const deliveringMerge = async (
	run: IGitRunner,
	commit: string,
	integration: string,
): Promise<string | undefined> => {
	const log = await read(run, [
		'log',
		'--first-parent',
		'--merges',
		'--reverse',
		'--format=%H',
		`${commit}..${integration}`,
	]);
	const merges = (log ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const contains = async (sha: string): Promise<boolean> =>
		(await run(['merge-base', '--is-ancestor', commit, sha])).ok;
	let low = 0;
	let high = merges.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const merge = merges[middle];
		if (merge !== undefined && (await contains(merge))) high = middle;
		else low = middle + 1;
	}
	return merges[low];
};

/**
 * Whether the merge that brought `commit` in changes a declared file of the
 * slice, or cites the proposal. Both false when no merge brought it.
 */
export const deliveredByMerge = async (
	run: IGitRunner,
	commit: string,
	integration: string,
	declaredFiles: readonly string[],
	proposalId: string,
): Promise<{
	readonly touchesSlice: boolean;
	readonly citesProposal: boolean;
}> => {
	const merge = await deliveringMerge(run, commit, integration);
	if (merge === undefined)
		return { touchesSlice: false, citesProposal: false };
	const [mergedPaths, mergeMessage] = await Promise.all([
		read(run, ['diff', '--name-only', `${merge}^1`, merge]),
		read(run, ['show', '-s', '--format=%B', merge]),
	]);
	const merged = new Set(
		(mergedPaths ?? '').split('\n').map((path) => path.trim()),
	);
	return {
		touchesSlice: declaredFiles.some((file) => merged.has(file)),
		citesProposal: (mergeMessage ?? '')
			.toLowerCase()
			.includes(proposalId.toLowerCase()),
	};
};
