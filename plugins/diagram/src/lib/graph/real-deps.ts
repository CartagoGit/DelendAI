/**
 * real-deps.ts — the production I/O adapter: discover workspace packages by
 * reading each manifest the root `package.json` workspaces name and
 * collecting their declared dependency names. The only module here that
 * touches the OS.
 */
import { dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	workspacePackageDirs,
} from '@delendai/core/runtime';

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
		for (const folder of await workspacePackageDirs(workspaceRootAbs))
			add(
				await readManifest(
					join(workspaceRootAbs, folder, 'package.json'),
				),
			);
		return out;
	},
});
