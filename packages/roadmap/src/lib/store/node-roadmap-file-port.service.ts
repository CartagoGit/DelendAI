import { readFile } from 'node:fs/promises';

import {
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

import type { IRoadmapFilePort } from '../contracts/interfaces/roadmap-store.interface';

const isMissing = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	(error as { readonly code?: unknown }).code === 'ENOENT';

/**
 * The file operations on a real disk: whole-file atomic writes, a lock
 * around the whole read-change-write, and a quarantine for unreadable
 * files.
 */
export const createNodeRoadmapFilePort = (): IRoadmapFilePort => ({
	read: async (path) => {
		try {
			return await readFile(path, 'utf8');
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw error;
		}
	},
	write: (path, content) => writeFileAtomic(path, content),
	quarantine: (path) => quarantineCorruptFile(path),
	withLock: (path, fn) => withFileMutex(path, fn),
});
