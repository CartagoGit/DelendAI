/**
 * real-deps.ts — the production I/O adapter: discover workspace packages by
 * reading each manifest under the conventional workspace roots and collecting
 * their declared dependency names. The only module here that touches the OS.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IDiagramDeps,
	IWorkspacePackage,
} from '../contracts/interfaces/graph.interface';

/** Conventional monorepo roots that hold workspace packages. */
const WORKSPACE_ROOTS = ['packages', 'plugins', 'apps', 'extensions'];

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
		// The repo root itself is a package too.
		const root = await readManifest(join(workspaceRootAbs, 'package.json'));
		if (root !== undefined) out.push(root);
		for (const dir of WORKSPACE_ROOTS) {
			const entries = await readdir(join(workspaceRootAbs, dir), {
				withFileTypes: true,
			}).catch(() => []);
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const manifest = await readManifest(
					join(workspaceRootAbs, dir, entry.name, 'package.json'),
				);
				if (manifest !== undefined) out.push(manifest);
			}
		}
		return out;
	},
});
