/**
 * committed-file-reader.helper.ts — read the files a commit holds at its
 * top level, without asking git for the ones it does not hold.
 *
 * Choosing a proof reads package.json and probes five lockfiles at the
 * integration head; each probe was a `git show`, and most of them answer
 * that the file is not there. One listing of the commit's top level
 * answers every absent one.
 */
import { readGit } from '../shared/git-read.helper';

/** A reader of `sha`'s files: their text, or `undefined` when absent. */
export const committedFileReader = (
	root: string,
	sha: string,
): ((path: string) => string | undefined) => {
	let topLevel: ReadonlySet<string> | undefined;
	return (path) => {
		if (!path.includes('/')) {
			topLevel ??= new Set(
				(readGit(root, ['ls-tree', '--name-only', sha]) ?? '').split(
					'\n',
				),
			);
			if (!topLevel.has(path)) return undefined;
		}
		return readGit(root, ['show', `${sha}:${path}`]);
	};
};
