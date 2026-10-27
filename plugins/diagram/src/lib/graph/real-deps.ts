/**
 * real-deps.ts — the production I/O adapter: discover workspace packages by
 * reading each manifest the root `package.json` workspaces name and
 * collecting their declared dependency names. The only module here that
 * touches the OS.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type {
	IDiagramDeps,
	IWorkspacePackage,
} from '../contracts/interfaces/graph.interface';

const DEP_SECTIONS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
];

const readManifest = async (
	path: string,
): Promise<IWorkspacePackage | undefined> => {
	try {
		const pkg = JSON.parse(
			(
				await new SafeWorkspaceReader(dirname(path)).readText(
					'package.json',
				)
			).content,
		) as Record<string, unknown>;
		if (typeof pkg.name !== 'string') return undefined;
		const dependencies = new Set<string>();
		for (const section of DEP_SECTIONS) {
			const block = pkg[section];
			if (block !== null && typeof block === 'object') {
				for (const dep of Object.keys(block)) dependencies.add(dep);
			}
		}
		return { name: pkg.name, dependencies: [...dependencies] };
	} catch {
		return undefined;
	}
};

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

/** Subfolders of `dir`, as workspace-relative paths. */
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

/** Production diagram deps rooted at `workspaceRootAbs`. */
export const realDiagramDeps = (workspaceRootAbs: string): IDiagramDeps => ({
	listWorkspacePackages: async () => {
		const out: IWorkspacePackage[] = [];
		const seen = new Set<string>();
		const add = (manifest: IWorkspacePackage | undefined): void => {
			if (manifest === undefined || seen.has(manifest.name)) return;
			seen.add(manifest.name);
			out.push(manifest);
		};
		// The repo root itself is a package too.
		add(await readManifest(join(workspaceRootAbs, 'package.json')));
		for (const glob of await declaredWorkspaces(workspaceRootAbs)) {
			for (const folder of await foldersOf(workspaceRootAbs, glob))
				add(
					await readManifest(
						join(workspaceRootAbs, folder, 'package.json'),
					),
				);
		}
		return out;
	},
});
