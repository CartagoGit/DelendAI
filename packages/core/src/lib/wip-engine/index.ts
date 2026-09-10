/**
 * index.ts — the WIP ref engine's public surface: one factory that binds
 * the three operations to a repository.
 *
 * Callers should not assemble an `IWipEngineContext` by hand. The context
 * carries the working-tree ROOT, and every scope path in this engine is
 * interpreted relative to it — resolving that once, from git itself
 * (`rev-parse --show-toplevel`), is what stops a caller's stale `cwd`
 * from turning "stage src/a.ts" into "stage the wrong src/a.ts".
 *
 * The engine's three promises, restated here because they are the reason
 * every operation is written in plumbing:
 *
 *   1. HEAD never moves. No switch, checkout, reset, merge or rebase ever
 *      runs against the shared working tree.
 *   2. Exact scope. A checkpoint contains only the supplied paths, staged
 *      through a temporary `GIT_INDEX_FILE`; `.git/index` is never opened.
 *   3. Foreign dirty files coexist. Other agents' uncommitted edits are
 *      neither captured nor a reason to refuse.
 */

import { createOrUpdateWipRef, type IWipEngineContext } from './checkpoint';
import { createScopedGitRunner, resolveWorktreeRoot } from './git-command';
import { rebaseWipOntoNewBase } from './rebase';
import { restorePathsFromRef } from './restore';

import type { IWipEngine } from './index.interface';

export type { IWipEngine } from './index.interface';

export type { IWipEngineContext } from './checkpoint';
export { createOrUpdateWipRef } from './checkpoint';
export { rebaseWipOntoNewBase } from './rebase';
export { restorePathsFromRef } from './restore';
export { computePatchDigest, parseObjectListing } from './patch-digest';
export {
	expandWorkRefTemplate,
	resolveWorkRef,
	sanitizeRefComponent,
	type IWorkRefVariables,
} from './ref-name';
export {
	DIGEST_TRAILER,
	SCOPE_TRAILER,
	isWithinScope,
	parseDigestTrailer,
	parseScopeTrailers,
	readRefScope,
	validateScopePaths,
} from './scope';
import type { IAnchorRequirement } from './anchor.interface';

export type * from './types.interface';
export {
	anchorFromPolicy,
	anchorRefusal,
	observeAnchor,
	UNANCHORED,
} from './anchor';
export type { IAnchorRequirement, TAnchorVerdict } from './anchor.interface';

/**
 * Bind the engine to the repository containing `cwd`. Returns `undefined`
 * when `cwd` is not inside a git working tree — a caller that cannot
 * persist work must find that out here, not halfway through a checkpoint.
 */
export const createWipEngine = async (
	cwd: string,
	anchor: IAnchorRequirement,
	timeoutMs?: number,
): Promise<IWipEngine | undefined> => {
	const run = createScopedGitRunner(cwd, timeoutMs);
	const root = await resolveWorktreeRoot(run);
	if (root === undefined || root.length === 0) return undefined;
	const context: IWipEngineContext = {
		run: createScopedGitRunner(root, timeoutMs),
		root,
		anchor,
	};
	return {
		context,
		createOrUpdateWipRef: (request) =>
			createOrUpdateWipRef(context, request),
		restorePathsFromRef: (request) => restorePathsFromRef(context, request),
		rebaseWipOntoNewBase: (request) =>
			rebaseWipOntoNewBase(context, request),
	};
};
