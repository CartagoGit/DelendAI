/**
 * scope.ts — `IStateScope` discriminator + `IScopeLocator`.
 *
 * q00018 Phase 0 S2. Four scopes:
 *
 *   - `project`              — per-worktree, never shared
 *   - `swarm`                — shared across worktrees of the same
 *                              local swarm (one repo instance)
 *   - `shared-content-cache` — optional, shared only when the key
 *                              is content-addressed
 *   - `worktree-cache`       — per-worktree private cache (depends
 *                              on filesystem / local context)
 *
 * The State Engine itself does NOT resolve paths. The host
 * (DelendAI core) computes the absolute root of every scope once
 * and hands it back through `IScopeLocator`. This keeps the engine
 * pure: it never calls `process.cwd()` or `path.resolve()`.
 *
 * Why four scopes, not three or two? Because the answer to "may
 * two worktrees share this state?" is genuinely different for
 * each kind of state, and pretending otherwise loses either
 * performance (cache every worktree separately) or coordination
 * (clobber claims across worktrees).
 */

/**
 * The kind of scope a State Engine generation belongs to.
 *
 * Discriminator of `IStateScope`. Adding a new kind is a
 * breaking change for every `IStateProducer` because the producer
 * declares which kinds it serves.
 */
export type StateScopeKind =
	| 'project'
	| 'swarm'
	| 'shared-content-cache'
	| 'worktree-cache';

/**
 * Resolved location for a scope. The host resolves absolute paths
 * once at boot; the engine never re-resolves. Locators are
 * treated as opaque identifiers — equality is structural and
 * based on every field.
 */
export interface IScopeLocator {
	/**
	 * Absolute path to the workspace root (the directory Git treats as
	 * its root). Always set for `project`, `swarm`, `worktree-cache`.
	 */
	readonly workspaceRoot: string;
	/**
	 * Absolute path to the shared cache root (e.g.
	 * `<workspaceRoot>/.cache/delendai`). Set when the scope has a
	 * cache root.
	 */
	readonly cacheRoot?: string;
	/**
	 * Absolute path to the shared swarm root. Set ONLY for
	 * `swarm` and `shared-content-cache` — these are the scopes
	 * that span worktrees. The path is stable per repo-instance
	 * (derived from the Git common dir + remote, never from the
	 * workspace path so renaming the workspace does not invalidate
	 * the swarm).
	 */
	readonly swarmRoot?: string;
	/**
	 * Absolute path to the docs root (`<workspaceRoot>/docs/delendai`).
	 * Optional; some scopes don't read durable project docs.
	 */
	readonly docsRoot?: string;
	/**
	 * Free-form bag for scope-specific metadata the host injects.
	 * Examples: the Git common dir, the remote URL, the resolved
	 * `repoInstanceId` (a stable id for this repo on this machine).
	 * MUST NOT contain anything that varies between two equivalent
	 * worktrees of the same swarm, otherwise the cache key
	 * diverges and the scope stops being shared.
	 */
	readonly identity?: Readonly<Record<string, string>>;
}

/**
 * Discriminated union of the four scopes. The discriminator is
 * `kind` so a switch over `scope.kind` exhaustively narrows the
 * locator to its scope-specific shape.
 */
export type IStateScope =
	| IStateScopeProject
	| IStateScopeSwarm
	| IStateScopeSharedContentCache
	| IStateScopeWorktreeCache;

/** Per-worktree projection (proposals, package graph, etc.). */
export interface IStateScopeProject {
	readonly kind: 'project';
	readonly locator: IScopeLocator;
}

/**
 * Shared swarm coordination (claims, leases, fencing tokens,
 * queue, agents, resource reservations, worktree registry). Every
 * worktree of the same local swarm reads and writes to the same
 * generation.
 */
export interface IStateScopeSwarm {
	readonly kind: 'swarm';
	readonly locator: IScopeLocator;
}

/**
 * Content-addressed cache shared across worktrees. Belongs here
 * ONLY when the cache key is provably independent of the worktree
 * (typically a Git blob SHA + parser version). The host may opt
 * out of this scope for any producer whose key includes path,
 * branch, mtime, hostname or any other worktree-local variable.
 */
export interface IStateScopeSharedContentCache {
	readonly kind: 'shared-content-cache';
	readonly locator: IScopeLocator;
}

/** Per-worktree private cache (depends on FS, branch, etc.). */
export interface IStateScopeWorktreeCache {
	readonly kind: 'worktree-cache';
	readonly locator: IScopeLocator;
}

/** Narrow helper that matches any non-shared scope. */
export type IWorktreeLocalScope = IStateScopeProject | IStateScopeWorktreeCache;

/** Narrow helper that matches any shared scope. */
export type ISharedScope = IStateScopeSwarm | IStateScopeSharedContentCache;

/**
 * Type-guard that narrows to `ISharedScope`. Useful for code that
 * branches on whether a generation can be re-used across worktrees
 * of the same swarm.
 */
export function isSharedScope(scope: IStateScope): scope is ISharedScope {
	return scope.kind === 'swarm' || scope.kind === 'shared-content-cache';
}

/** Type-guard that narrows to `IWorktreeLocalScope`. */
export function isWorktreeLocalScope(
	scope: IStateScope,
): scope is IWorktreeLocalScope {
	return scope.kind === 'project' || scope.kind === 'worktree-cache';
}

/**
 * Two scopes are "the same identity" iff their kind and the
 * identity-relevant fields of their locator match. The function is
 * pure: it never normalises paths (the host is responsible for
 * canonicalising the workspace root before injecting it).
 */
export function scopesEqual(a: IStateScope, b: IStateScope): boolean {
	if (a.kind !== b.kind) return false;
	return locatorsEqual(a.locator, b.locator);
}

/**
 * Two locators are equal iff every identity-relevant field is
 * strictly equal. `cacheRoot`, `docsRoot` and `identity` are
 * compared as deep objects (string-only — locators never carry
 * arrays or nested values).
 */
export function locatorsEqual(a: IScopeLocator, b: IScopeLocator): boolean {
	if (a.workspaceRoot !== b.workspaceRoot) return false;
	if ((a.cacheRoot ?? null) !== (b.cacheRoot ?? null)) return false;
	if ((a.swarmRoot ?? null) !== (b.swarmRoot ?? null)) return false;
	if ((a.docsRoot ?? null) !== (b.docsRoot ?? null)) return false;
	return shallowStringRecordEqual(a.identity ?? {}, b.identity ?? {});
}

function shallowStringRecordEqual(
	a: Readonly<Record<string, string>>,
	b: Readonly<Record<string, string>>,
): boolean {
	const ak = Object.keys(a).sort();
	const bk = Object.keys(b).sort();
	if (ak.length !== bk.length) return false;
	for (let i = 0; i < ak.length; i += 1) {
		const k = ak[i] as string;
		if (k !== (bk[i] as string)) return false;
		if (a[k] !== b[k]) return false;
	}
	return true;
}
