/**
 * project-roots.helper.ts — where a project keeps its code, read from the
 * project itself.
 *
 * The context search named DelendAI's own folders (`packages`, `plugins`,
 * `apps`, …) and found nothing in a project laid out any other way. A
 * project's workspaces say where its code lives; a project with none is
 * searched whole (the search skips what git ignores).
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The folder a workspace glob starts in: `packages/*` → `packages`. */
const folderOf = (glob: string): string =>
	glob
		.split(/[*?{[]/u)[0]
		?.replace(/\/+$/u, '')
		.replace(/^\.\//u, '') ?? '';

/**
 * The folders to search, from the workspaces in `package.json`, or
 * `undefined` for the whole workspace when it declares none.
 */
export const projectSearchRoots = async (
	workspaceRootAbs: string,
): Promise<readonly string[] | undefined> => {
	let workspaces: unknown;
	try {
		workspaces = (
			JSON.parse(
				await readFile(join(workspaceRootAbs, 'package.json'), 'utf8'),
			) as { workspaces?: unknown }
		).workspaces;
	} catch {
		return undefined;
	}
	const globs = Array.isArray(workspaces)
		? workspaces
		: (workspaces as { packages?: unknown } | undefined)?.packages;
	if (!Array.isArray(globs)) return undefined;
	const folders = [
		...new Set(
			globs
				.filter((glob): glob is string => typeof glob === 'string')
				.map(folderOf)
				.filter((folder) => folder.length > 0),
		),
	];
	const present: string[] = [];
	for (const folder of folders) {
		try {
			await access(join(workspaceRootAbs, folder));
			present.push(folder);
		} catch {
			// A declared workspace that is not there holds nothing to find.
		}
	}
	return present.length > 0 ? present : undefined;
};
