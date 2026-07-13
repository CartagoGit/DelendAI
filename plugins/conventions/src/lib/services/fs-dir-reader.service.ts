/**
 * fs-dir-reader.ts — production `IDirReader` backed by `node:fs`.
 *
 * The only filesystem-touching code in the plugin. It resolves
 * repo-relative POSIX paths against an absolute `rootDir` and returns
 * `readdir(..., { withFileTypes: true })` entries adapted to the narrow
 * `IDirEntry` port — keeping `conventions-scan.ts` pure and testable.
 */
import { readdir } from 'node:fs/promises';

import { resolveWorkspaceContained } from '@mcp-vertex/core/public';

import type {
	IDirEntry,
	IDirReader,
} from '../services/conventions-scan.service';

/** Build a `node:fs`-backed reader rooted at `rootDir` (absolute path). */
export const createFsDirReader = async (
	rootDir: string,
): Promise<IDirReader> => ({
	async list(relDir: string): Promise<readonly IDirEntry[]> {
		const contained = resolveWorkspaceContained(rootDir, relDir || '.');
		if (!contained.ok) {
			throw new Error(
				`conventions scan root "${relDir}" is not allowed: ${contained.reason}`,
			);
		}
		const dirents = await readdir(contained.abs, { withFileTypes: true });
		return dirents.map((dirent) => ({
			name: dirent.name,
			isDirectory: dirent.isDirectory(),
		}));
	},
});
