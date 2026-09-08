/**
 * scope.ts — `StateScope` runtime helpers.
 *
 * x00530 S1: the `StateScope` type surface (locators, brands, the
 * discriminated union and its narrowing aliases) moved to
 * `@delendai/contracts/state`, because it is part of the
 * transitive type closure of `IStateRegistry` — a type
 * `@delendai/core` exposes on its PUBLIC plugin contract. The
 * runtime helpers stay here; the types are re-exported verbatim so
 * every existing `@delendai/state/scope` import keeps resolving.
 *
 * The architectural invariants the types encode are documented on
 * the declarations in `@delendai/contracts/state`.
 */

import type {
	StateScope,
	WorktreeId,
	RepositoryInstanceId,
	ISharedScope,
	IWorktreeLocalScope,
} from '@delendai/contracts/state';

export type {
	WorktreeId,
	RepositoryInstanceId,
	StateScopeKind,
	IWorktreeCacheLocator,
	IProjectLocator,
	ISwarmLocator,
	ISharedContentCacheLocator,
	StateScope,
	StateLocator,
	StateLocatorOf,
	IWorktreeLocalScope,
	ISharedScope,
} from '@delendai/contracts/state';

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
