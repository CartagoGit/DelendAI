import { isAbsolute, resolve } from 'node:path';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';

/**
 * Default `IWorkspacePathProvider`: resolves workspace-relative
 * paths against an explicit root (never `process.cwd()` implicitly)
 * and memoises resolutions, mirroring the behaviour of the historical
 * the host project `resolveWorkspacePath` helper.
 */
export function createWorkspacePathProvider(
	root: string,
): IWorkspacePathProvider {
	const absoluteRoot = resolve(root);
	const memo = new Map<string, string>();
	return {
		root: absoluteRoot,
		resolve(relativePath: string): string {
			if (isAbsolute(relativePath)) {
				return relativePath;
			}
			const cached = memo.get(relativePath);
			if (cached !== undefined) {
				return cached;
			}
			const resolved = resolve(absoluteRoot, relativePath);
			memo.set(relativePath, resolved);
			return resolved;
		},
	};
}
