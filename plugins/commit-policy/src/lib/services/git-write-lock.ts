import { join } from 'node:path';

import { withFileMutex } from '@delendai/core/public';

const LOCK_PATH = 'git-write';

export const withGitWriteLock = async <T>(
	workspaceRoot: string | undefined,
	pluginCacheDir: string | undefined,
	operation: () => Promise<T>,
): Promise<T> => {
	if (workspaceRoot === undefined) return operation();
	const root = pluginCacheDir ?? '.cache/mcp-vertex/commit-policy';
	return withFileMutex(join(workspaceRoot, root, LOCK_PATH), operation, {
		onContention: 'wait',
		timeoutMs: 120_000,
		staleMs: 300_000,
	});
};
