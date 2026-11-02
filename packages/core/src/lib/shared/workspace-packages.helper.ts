/**
 * workspace-packages.helper.ts — the package folders a project's root
 * `package.json` workspaces declare, so every tool that reads "the
 * packages" reads the same ones, whatever folders a project uses.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '../filesystem/safe-workspace-reader';

/** The workspace globs the root manifest declares, in either form. */
const declaredWorkspaces = async (
	workspaceRootAbs: string,
): Promise<readonly string[]> => {
	try {
		const { workspaces } = JSON.parse(
			(
				await new SafeWorkspaceReader(workspaceRootAbs).readText(
					'package.json',
				)
			).content,
		) as { workspaces?: unknown };
		const globs = Array.isArray(workspaces)
			? workspaces
			: (workspaces as { packages?: unknown } | undefined)?.packages;
		return Array.isArray(globs)
			? globs.filter((glob): glob is string => typeof glob === 'string')
			: [];
	} catch {
		return [];
	}
};

/** Subfolders of `dir`, as workspace-relative paths; dependencies are never packages of the project. */
const subfolders = async (
	workspaceRootAbs: string,
	dir: string,
): Promise<readonly string[]> =>
	(
		await readdir(join(workspaceRootAbs, dir), {
			withFileTypes: true,
		}).catch(() => [])
	)
		.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
		.map((entry) =>
			dir.length === 0 ? entry.name : `${dir}/${entry.name}`,
		);

/**
 * The folders a workspace glob names: `packages/*` its subfolders,
 * `tools/**` every folder under `tools`, and a plain path itself.
 */
const foldersOf = async (
	workspaceRootAbs: string,
	glob: string,
): Promise<readonly string[]> => {
	const path = glob.replace(/^\.\//u, '').replace(/\/+$/u, '');
	if (path.endsWith('/**')) {
		const out: string[] = [];
		let level = await subfolders(workspaceRootAbs, path.slice(0, -3));
		while (level.length > 0) {
			out.push(...level);
			const next: string[] = [];
			for (const folder of level)
				next.push(...(await subfolders(workspaceRootAbs, folder)));
			level = next;
		}
		return out;
	}
	if (path.endsWith('/*'))
		return subfolders(workspaceRootAbs, path.slice(0, -2));
	return /[*?{[]/u.test(path) ? [] : [path];
};

/**
 * Every folder the root `package.json` workspaces name (array or
 * `{ packages }` form), workspace-relative, once each, in declaration
 * order. A folder need not hold a manifest; callers read what they need.
 */
export const workspacePackageDirs = async (
	workspaceRootAbs: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	for (const glob of await declaredWorkspaces(workspaceRootAbs))
		for (const folder of await foldersOf(workspaceRootAbs, glob))
			if (!out.includes(folder)) out.push(folder);
	return out;
};
