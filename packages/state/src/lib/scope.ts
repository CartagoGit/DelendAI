/**
 * scope.ts — `StateScope` discriminator + per-kind locators.
 *
 * q00018 Phase 0.1. Four scopes, each with a typed locator that
 * captures ONLY the identity-relevant fields for that scope kind.
 *
 * Rules (architectural invariants, not suggestions):
 *
 *   - `project` / `worktree-cache`: identity is per worktree.
 *     The locator carries a `WorktreeId` (a stable id the host
 *     derives once and never re-derives per call).
 *   - `swarm` / `shared-content-cache`: identity is per repo
 *     instance on this machine. The locator carries a
 *     `RepositoryInstanceId` (stable; derived from the Git common
 *     dir + remote, NEVER from an absolute path so renaming the
 *     workspace does not invalidate the swarm).
 *   - The locator for `swarm` MUST NOT depend on any field of
 *     `project` or `worktree-cache`; that is what makes the
 *     scope shareable across worktrees.
 *   - Paths inside a locator are absolute but the engine never
 *     resolves them — the host provides them once at boot.
 *
 * Why typed locators instead of a single bag with optional
 * fields? Because the old shape let callers construct
 * semantically invalid combinations (`project` + `swarmRoot`,
 * `swarm` + `workspaceRoot`, etc). The new shape makes those
 * combinations unrepresentable.
 */

import type { Brand } from './util/brand';

/** A stable worktree id derived once by the host. */
export type WorktreeId = Brand<string, 'WorktreeId'>;

/** A stable repository instance id derived once by the host (NOT the path). */
export type RepositoryInstanceId = Brand<string, 'RepositoryInstanceId'>;

/** The kind of scope a State Engine generation belongs to. */
export type StateScopeKind =
	| 'project'
	| 'swarm'
	| 'shared-content-cache'
	| 'worktree-cache';

/** Per-worktree private cache. Identity = the worktree id. */
export interface IWorktreeCacheLocator {
	readonly workspaceRoot: string;
	readonly cacheRoot: string;
	readonly worktreeId: WorktreeId;
}

/** Per-worktree projection (proposals, package graph, etc.). */
export interface IProjectLocator {
	readonly workspaceRoot: string;
	readonly worktreeId: WorktreeId;
	readonly cacheRoot: string;
	readonly docsRoot: string;
}

/**
 * Shared swarm coordination. Identity = the repository instance id.
 * Two worktrees of the same repo on the same machine share the
 * SAME `swarm` generation; the `workspaceRoot` MAY differ.
 */
export interface ISwarmLocator {
	readonly repositoryInstanceId: RepositoryInstanceId;
	readonly swarmRoot: string;
}

/**
 * Content-addressed cache shared across worktrees. Belongs here
 * ONLY when the cache key is provably independent of the worktree
 * (typically a Git blob SHA + parser version). The host may opt
 * out of this scope for any producer whose key includes path,
 * branch, mtime, hostname or any other worktree-local variable.
 */
export interface ISharedContentCacheLocator {
	readonly repositoryInstanceId: RepositoryInstanceId;
	readonly swarmRoot: string;
	readonly cacheNamespace: string;
}

/**
 * Discriminated union. `locator` narrows by `kind` so an
 * exhaustive switch on `kind` brings the right fields into scope.
 */
export type StateScope =
	| { readonly kind: 'project'; readonly locator: IProjectLocator }
	| { readonly kind: 'swarm'; readonly locator: ISwarmLocator }
	| {
			readonly kind: 'shared-content-cache';
			readonly locator: ISharedContentCacheLocator;
	  }
	| {
			readonly kind: 'worktree-cache';
			readonly locator: IWorktreeCacheLocator;
	  };

/** Type alias that re-uses the union as the public discriminator. */
export type StateLocator = StateScope;
export type StateLocatorOf<K extends StateScopeKind> = Extract<
	StateScope,
	{ kind: K }
>['locator'];

/** Two scopes are "the same identity" iff their kind + typed locator match. */
export function scopesEqual(a: StateScope, b: StateScope): boolean {
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case 'project': {
			const av = a.locator;
			const bv = (b as Extract<StateScope, { kind: 'project' }>).locator;
			return (
				av.workspaceRoot === bv.workspaceRoot &&
				av.cacheRoot === bv.cacheRoot &&
				av.docsRoot === bv.docsRoot &&
				av.worktreeId === bv.worktreeId
			);
		}
		case 'swarm': {
			const av = a.locator;
			const bv = (b as Extract<StateScope, { kind: 'swarm' }>).locator;
			return (
				av.repositoryInstanceId === bv.repositoryInstanceId &&
				av.swarmRoot === bv.swarmRoot
			);
		}
		case 'shared-content-cache': {
			const av = a.locator;
			const bv = (
				b as Extract<StateScope, { kind: 'shared-content-cache' }>
			).locator;
			return (
				av.repositoryInstanceId === bv.repositoryInstanceId &&
				av.swarmRoot === bv.swarmRoot &&
				av.cacheNamespace === bv.cacheNamespace
			);
		}
		case 'worktree-cache': {
			const av = a.locator;
			const bv = (b as Extract<StateScope, { kind: 'worktree-cache' }>)
				.locator;
			return (
				av.workspaceRoot === bv.workspaceRoot &&
				av.cacheRoot === bv.cacheRoot &&
				av.worktreeId === bv.worktreeId
			);
		}
		default:
			return false;
	}
}

/** Narrowed helper that matches any non-shared scope. */
export type IWorktreeLocalScope = Extract<
	StateScope,
	{ kind: 'project' | 'worktree-cache' }
>;

/** Narrowed helper that matches any shared scope. */
export type ISharedScope = Extract<
	StateScope,
	{ kind: 'swarm' | 'shared-content-cache' }
>;

/** Type-guard that narrows to `ISharedScope`. */
export function isSharedScope(scope: StateScope): scope is ISharedScope {
	return scope.kind === 'swarm' || scope.kind === 'shared-content-cache';
}

/** Type-guard that narrows to `IWorktreeLocalScope`. */
export function isWorktreeLocalScope(
	scope: StateScope,
): scope is IWorktreeLocalScope {
	return scope.kind === 'project' || scope.kind === 'worktree-cache';
}

/**
 * Mint a stable `WorktreeId` from a host-derived string. The host
 * is responsible for sanitising the raw value (lowercase, no
 * whitespace, no path separators). We only brand it.
 */
export function asWorktreeId(raw: string): WorktreeId {
	return raw as WorktreeId;
}

/** Brand a `RepositoryInstanceId` from a host-derived string. */
export function asRepositoryInstanceId(raw: string): RepositoryInstanceId {
	return raw as RepositoryInstanceId;
}
