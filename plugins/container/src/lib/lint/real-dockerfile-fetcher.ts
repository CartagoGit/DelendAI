/**
 * real-dockerfile-fetcher.ts — f00133 S2.
 *
 * Reads a Dockerfile from a workspace-relative path. The fetcher is
 * injected so tests can supply an in-memory source.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface IDockerfileFetcher {
	readonly read: (workspaceRoot: string, relPath: string) => Promise<string>;
}

export const realDockerfileFetcher: IDockerfileFetcher = {
	async read(workspaceRoot: string, relPath: string): Promise<string> {
		const resolved = isAbsolute(relPath)
			? relPath
			: resolve(workspaceRoot, relPath);
		const root = resolve(workspaceRoot);
		const rel = relative(root, resolved);
		if (rel.startsWith('..') || isAbsolute(rel)) {
			throw new Error(
				`Dockerfile path must live under the workspace root (${workspaceRoot}); got ${relPath}`,
			);
		}
		return readFile(resolved, 'utf8');
	},
};
