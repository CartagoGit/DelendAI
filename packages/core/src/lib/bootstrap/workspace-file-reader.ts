// workspace-file-reader: the default `IFileReader` for the bootstrap
// tools, backed by the workspace filesystem.
//
// SOLID — Single Responsibility. This module owns ONE thing: turning
// an `IWorkspacePathProvider` into the `IFileReader` the analyser
// uses. The two are NOT the same interface — the reader is read-only
// + bounded by the workspace root, and the path provider is a
// resolver. Keeping them as distinct types is what makes the
// analyser testable with a fake reader.

import { promises as fs } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IFileReader } from './analyze-project';

export const createWorkspaceFileReader = (
	workspace: IWorkspacePathProvider,
): IFileReader => ({
	readFile: async (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		try {
			return await fs.readFile(absolute, 'utf8');
		} catch {
			return undefined;
		}
	},
	exists: async (relativePath) => {
		try {
			await fs.access(workspace.resolve(relativePath));
			return true;
		} catch {
			return false;
		}
	},
	listDir: async (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		try {
			return await fs.readdir(absolute);
		} catch {
			return [];
		}
	},
});
