/**
 * fs-dir-reader.ts — production `IDirReader` backed by `node:fs`.
 *
 * The only filesystem-touching code in the plugin. It resolves
 * repo-relative POSIX paths against an absolute `rootDir` and returns
 * `readdir(..., { withFileTypes: true })` entries adapted to the narrow
 * `IDirEntry` port — keeping `conventions-scan.ts` pure and testable.
 */
import { readdir } from 'node:fs/promises';

import {
	resolveExistingWorkspaceContained,
	SafeWorkspaceReader,
} from '@delendai/core/public';

import type { IArchitectureReader } from '../contracts/interfaces/check-architecture.interface';

import type {
	IDirEntry,
	IDirReader,
} from '../services/conventions-scan.service';

/** Build a `node:fs`-backed reader rooted at `rootDir` (absolute path). */
export const createFsDirReader = async (
	rootDir: string,
): Promise<IDirReader> => ({
	async list(relDir: string): Promise<readonly IDirEntry[]> {
		// PHYSICAL containment: the lexical check never touches the disk,
		// so `rootDir/link` passed it while `link` pointed at somewhere
		// outside the workspace entirely. This resolves the real path
		// before the directory is ever listed.
		const contained = await resolveExistingWorkspaceContained(
			rootDir,
			relDir || '.',
		);
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

/**
 * The architecture report's reader: the same containment-checked listing,
 * plus text reads through `SafeWorkspaceReader` so a symlink can never
 * lead a scan outside the workspace. A file that cannot be read is
 * skipped rather than failing the whole report.
 */
export const createFsArchitectureReader = async (
	rootDir: string,
): Promise<IArchitectureReader> => {
	const lister = await createFsDirReader(rootDir);
	const safe = new SafeWorkspaceReader(rootDir);
	return {
		list: (relDir) => lister.list(relDir),
		async readText(relPath: string): Promise<string | undefined> {
			try {
				return (await safe.readText(relPath)).content;
			} catch {
				return undefined;
			}
		},
	};
};
