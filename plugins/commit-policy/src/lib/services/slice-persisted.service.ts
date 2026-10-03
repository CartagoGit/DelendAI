/**
 * Whether a finished slice still has anything to persist.
 *
 * The processed-events store records what this plugin handled, and it
 * starts empty in a fresh cache, after the cache is cleared, or when the
 * plugin is first enabled on a project with history. Asked alone, it
 * called every already-`done` slice unpersisted: an adopter project got
 * checkpoints for ten slices committed two days earlier, all in the same
 * minute. Git knows better. A slice whose files have no uncommitted
 * change has nothing left to persist, whoever committed it.
 */
import type { IGitRunner } from '@delendai/core/public';

/**
 * True when every path the slice names is clean: no staged, unstaged or
 * untracked change. `false` when git cannot answer, so an unreadable
 * repository never silences a slice that does need persisting.
 */
export const sliceFilesAreCommitted = async (
	run: IGitRunner,
	files: readonly string[],
): Promise<boolean> => {
	if (files.length === 0) return false;
	const status = await run([
		'status',
		'--porcelain',
		'--untracked-files=all',
		'--',
		...files,
	]);
	return status.ok && status.output.trim() === '';
};
