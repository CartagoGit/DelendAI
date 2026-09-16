/**
 * fs-scan-reader.ts — production `IScanReader` backed by `node:fs`
 * (x00167). The only filesystem-touching code `scanDrift` depends on.
 * Mirrors `@delendai/conventions`'s `createFsDirReader` (the same
 * recursive-listing problem, solved there first): resolves
 * repo-relative POSIX paths against an absolute `rootDir` and returns
 * `readdir(..., { withFileTypes: true })` entries adapted to the
 * narrow `IDirEntry` port, keeping `scan.ts` pure and testable.
 */
import { readdir } from 'node:fs/promises';

import {
	resolveExistingWorkspaceContained,
	SafeWorkspaceReader,
} from '@delendai/core/public';

import type { IDirEntry, IScanReader } from './scan';

/** Build an `IScanReader` backed by `node:fs`, rooted at `rootDir` (absolute). */
export const createFsScanReader = (rootDir: string): IScanReader => ({
	list: async (relDir: string): Promise<readonly IDirEntry[]> => {
		// Physical containment: a directory reached through a symlink
		// that escapes the root lists someone else's tree, and the
		// lexical check cannot see it.
		const contained = await resolveExistingWorkspaceContained(
			rootDir,
			relDir || '.',
		);
		if (!contained.ok) return [];
		const dirents = await readdir(contained.abs, {
			withFileTypes: true,
		}).catch(() => []);
		return dirents.map((dirent) => ({
			name: dirent.name,
			isDirectory: dirent.isDirectory(),
		}));
	},
	readFile: async (relPath: string): Promise<string | undefined> => {
		const contained = await resolveExistingWorkspaceContained(
			rootDir,
			relPath,
		);
		if (!contained.ok) return undefined;
		try {
			return (
				await new SafeWorkspaceReader(rootDir).readText(contained.rel)
			).content;
		} catch {
			return undefined;
		}
	},
});
