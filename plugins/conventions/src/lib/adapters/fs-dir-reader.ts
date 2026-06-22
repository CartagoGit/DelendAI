/**
 * fs-dir-reader.ts — production `IDirReader` backed by `node:fs`.
 *
 * The only filesystem-touching code in the plugin. It resolves
 * repo-relative POSIX paths against an absolute `rootDir` and returns
 * `readdir(..., { withFileTypes: true })` entries adapted to the narrow
 * `IDirEntry` port — keeping `conventions-scan.ts` pure and testable.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { IDirEntry, IDirReader } from '../conventions-scan';

/** Build a `node:fs`-backed reader rooted at `rootDir` (absolute path). */
export const createFsDirReader = (rootDir: string): IDirReader => ({
	async list(relDir: string): Promise<readonly IDirEntry[]> {
		const abs = relDir === '' ? rootDir : join(rootDir, relDir);
		const dirents = await readdir(abs, { withFileTypes: true });
		return dirents.map((dirent) => ({
			name: dirent.name,
			isDirectory: dirent.isDirectory(),
		}));
	},
});
