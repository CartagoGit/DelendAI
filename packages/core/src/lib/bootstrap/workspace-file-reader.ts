// workspace-file-reader: the default `IFileReader` for the bootstrap
// tools, backed by the workspace filesystem.
//
// SOLID — Single Responsibility. This module owns ONE thing: turning
// an `IWorkspacePathProvider` into the `IFileReader` the analyser
// uses. The two are NOT the same interface — the reader is read-only
// + bounded by the workspace root, and the path provider is a
// resolver. Keeping them as distinct types is what makes the
// analyser testable with a fake reader.

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IFileReader } from './analyze-project';

/**
 * Read-only reader backed by the workspace filesystem. `readFile` and
 * `exists` use `existsSync` (cheap boot-time probe, NOT a hot path —
 * see AGENTS.md invariant #3); `listDir` swallows the error and
 * returns `[]` so a missing directory looks like an empty one to the
 * analyser instead of crashing the whole tool.
 */
export const createWorkspaceFileReader = (
	workspace: IWorkspacePathProvider,
): IFileReader => ({
	readFile: (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		return existsSync(absolute)
			? readFileSync(absolute, 'utf8')
			: undefined;
	},
	exists: (relativePath) => existsSync(workspace.resolve(relativePath)),
	listDir: (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		try {
			return readdirSync(absolute);
		} catch {
			return [];
		}
	},
});
