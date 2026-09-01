/**
 * runtime/index.ts — subpath export for @mcp-vertex/core/runtime.
 *
 * r00028 (Track C / §9): runtime helpers (commit, push, file
 * reading/writing, mutex) — Node-aware. Plugins that need a
 * runtime value but do NOT need the full public surface should
 * import from this subpath to keep their dependency footprint
 * small.
 */

export { commitAndPush } from '../lib/shared/git-write';
export {
	writeFileAtomic,
	writeFileAtomicSync,
} from '../lib/shared/atomic-write';
export { withFileMutex } from '../lib/shared/with-file-mutex';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export type { ISafeWorkspaceReaderOptions } from '../lib/filesystem/safe-workspace-reader';
export { WorkspaceContainmentError } from '../lib/filesystem/safe-workspace-reader.errors';
export type {
	ICommitAndPushOptions,
	ICommitAndPushResult,
} from '../lib/shared/git-write';
export type {
	IGitRunner,
	IGitRunResult,
} from '../lib/contracts/interfaces/git-runner.interface';
