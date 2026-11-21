/**
 * units-directory.service.ts — the one place that answers "where do the
 * units of work live in this workspace".
 *
 * WHY a service and not a constant: the folder of units is derived from
 * the cache root the project's own configuration declares, and a constant
 * cannot read a configuration. The answer is `<cacheDir>/.worktrees` —
 * the same path the proposals plugin builds (`buildSwarmPaths` →
 * `worktreesDir`) and the same one the eviction policy protects
 * (`EVICTION_PROTECTED_PATHS` names `.worktrees` under the cache root).
 * One authority, three readers.
 *
 * WHY it matters: a worktree is a full checkout of the repository, and
 * it appears and disappears every time an agent starts or ends a unit.
 * A checkout inside the tree is a tree the editor watches, so every one
 * of those moves is a burst of file events for every language server
 * watching the workspace — a burst that arrives while the server is
 * restarting, and fails.
 */
import { readWorkspaceCacheDir } from './development-policy.service';
import { unitsDirectoryFor } from './units-directory.constant';

/**
 * Where the units of work live for the workspace rooted at `root`.
 * Absolute when the project declares an absolute cache root, relative
 * to the workspace otherwise.
 */
export const resolveUnitsDirectory = async (root: string): Promise<string> =>
	unitsDirectoryFor(await readWorkspaceCacheDir(root));
