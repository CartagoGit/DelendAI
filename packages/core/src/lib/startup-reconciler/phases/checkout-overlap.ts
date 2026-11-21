/**
 * checkout-overlap.ts — which uncommitted edits an advance of the shared
 * checkout would touch (x00675).
 */
import type { IStartupGitSeam } from '../seams.interface';

/**
 * The edited paths the advance to `target` would change, or `undefined`
 * when that cannot be established — and then nothing moves.
 */
export const overlapWith = async (
	git: IStartupGitSeam,
	dirty: readonly string[],
	target: string,
): Promise<readonly string[] | undefined> => {
	if (git.pathsChangedBetween === undefined) return undefined;
	const changed = await git.pathsChangedBetween('HEAD', target);
	if (changed === undefined) return undefined;
	const incoming = new Set(changed);
	return dirty.filter((path) => incoming.has(path));
};
