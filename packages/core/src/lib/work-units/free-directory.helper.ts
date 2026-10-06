/**
 * free-directory.helper.ts — where a new unit's worktree goes when its
 * default directory is taken.
 */
import { access } from 'node:fs/promises';

/**
 * `dir`, or the first `<dir>-<n>` nothing occupies. The default directory
 * names the unit as it was entered, and a unit renamed since (a `new`
 * unit that took its proposal's id) keeps standing in it: the next new
 * proposal was refused its worktree until `--dir` named another.
 */
export const freeDirectory = async (dir: string): Promise<string> => {
	const taken = (path: string): Promise<boolean> =>
		access(path).then(
			() => true,
			() => false,
		);
	if (!(await taken(dir))) return dir;
	for (let n = 2; ; n += 1) {
		const next = `${dir}-${String(n)}`;
		if (!(await taken(next))) return next;
	}
};
