import { dirname } from 'node:path';

import {
	quarantineCorruptFile,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

import type { IRoadmapFilePort } from '../contracts/interfaces/roadmap-store.interface';

/**
 * The file operations on a real disk: whole-file atomic writes, a lock
 * around the whole read-change-write, and a quarantine for unreadable
 * files.
 */
export const createNodeRoadmapFilePort = (): IRoadmapFilePort => ({
	// The caller has already contained `path` in its workspace; the
	// reader is rooted at the file's own directory so that a symlink
	// placed there cannot carry the read anywhere else.
	read: async (path) => {
		const reader = new SafeWorkspaceReader(dirname(path));
		if ((await reader.exists(path)) === null) return undefined;
		return (await reader.readText(path)).content;
	},
	write: (path, content) => writeFileAtomic(path, content),
	quarantine: (path) => quarantineCorruptFile(path),
	withLock: (path, fn) => withFileMutex(path, fn),
});
