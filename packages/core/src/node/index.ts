/**
 * node/index.ts — subpath export for @delendai/core/node.
 *
 * r00028 (Track C / §9): the Node-only runtime primitives.
 * Use this subpath when you need to spawn a Node process or
 * touch the filesystem in a way that the rest of `core` would
 * not allow (e.g. privileged plugins). The Node imports stay
 * here so the rest of the package can stay Node-agnostic where
 * possible.
 */

export { commitAndPush } from '../lib/shared/git-write';
export {
	writeFileAtomic,
	writeFileAtomicSync,
} from '../lib/shared/atomic-write';
export { withFileMutex } from '../lib/shared/with-file-mutex';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export { WorkspaceContainmentError } from '../lib/filesystem/safe-workspace-reader.errors';
export { nodeDynamicImport } from './dynamic-import';
export {
	loadPlugins,
	resolvePluginSpecifier,
} from '../lib/plugins/load-plugins';
