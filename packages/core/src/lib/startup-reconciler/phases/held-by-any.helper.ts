import type { IStartupGitSeam } from '../seams.interface';

/**
 * Whether a checkpoint is held by any of `tips`. A start examines every
 * checkpoint against every ref, so the commits are listed once, on the first
 * question, and a process per pair is only the fallback.
 */
export const heldByAny = (
	git: Pick<IStartupGitSeam, 'isAncestor' | 'reachableFrom'>,
	tips: readonly string[],
): ((sha: string) => Promise<boolean>) => {
	let listing: Promise<ReadonlySet<string> | undefined> | undefined;
	return async (sha) => {
		if (tips.length === 0) return false;
		listing ??= git.reachableFrom?.(tips) ?? Promise.resolve(undefined);
		const reachable = await listing;
		if (reachable !== undefined) return reachable.has(sha);
		for (const tip of tips) {
			if (tip === sha || (await git.isAncestor(sha, tip))) return true;
		}
		return false;
	};
};
