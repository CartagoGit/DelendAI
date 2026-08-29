import { join } from 'node:path';

import { withFileMutex } from '@mcp-vertex/core/public';

const LOCK_PATH = '.commit-policy/git-write';

export const withGitWriteLock = async <T>(
	workspaceRoot: string | undefined,
	operation: () => Promise<T>,
): Promise<T> => {
	if (workspaceRoot === undefined) return operation();
	return withFileMutex(join(workspaceRoot, LOCK_PATH), operation, {
		onContention: 'wait',
		timeoutMs: 120_000,
		staleMs: 300_000,
	});
};
