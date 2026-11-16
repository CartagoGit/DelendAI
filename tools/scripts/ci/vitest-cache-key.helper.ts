import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The key used when the workspace has no `bun.lock`. */
export const NO_LOCKFILE_CACHE_KEY = 'no-lockfile';

/**
 * The directory vitest keeps its transformed modules in, keyed by the
 * lockfile.
 *
 * vitest clears its whole cache directory when the lockfile hash it stored
 * differs from the current one. `prove` starts several vitest processes in
 * one worktree, so after a lockfile change they all removed the same tree at
 * once and failed with `ENOTEMPTY`. A directory per lockfile means a changed
 * lockfile selects a new empty directory (nothing stored, nothing to clear)
 * and no process deletes a directory another one is using. Old directories
 * are never pruned here: pruning from every process would bring the race back.
 */
export const vitestModuleCachePath = (workspaceRoot: string): string => {
	let key = NO_LOCKFILE_CACHE_KEY;
	try {
		key = createHash('sha256')
			.update(readFileSync(join(workspaceRoot, 'bun.lock')))
			.digest('hex')
			.slice(0, 16);
	} catch {
		// No lockfile: the fixed key above.
	}
	return join(workspaceRoot, 'node_modules', '.vitest-cache', key);
};
