/**
 * worktree-sync-coordinator.ts — Solid SRP + DIP for the worktree/registry
 * race (r00003 S10 / a00036 CONC-1).
 *
 * `git worktree add` mutates `.git` (it writes `.git/worktrees/<name>` and
 * touches the index/refs) at the same time the proposals registry sync
 * (`syncProposalRegistry.run()`) reads + rewrites
 * `<cacheDir>/proposals/index.json` (the regenerable registry
 * index — see x00052 for the move from
 * `docs/mcp-vertex/proposals/index.json`).
 * When the two run concurrently, the registry sync can read a half-updated
 * view (a worktree dir that exists but whose branch ref is not yet visible)
 * and persist a stale index.
 *
 * The engine should NOT know how the two operations are serialized — that is
 * a coordination concern, not git-worktree mechanics. So the engine depends
 * on `IWorktreeSyncCoordinator`:
 *
 *   - **SRP**: the engine focuses on building the right `git worktree`
 *     argv; the coordinator owns "take the registry lock, run the git op,
 *     release".
 *   - **DIP**: the engine is pure over the coordinator. Production injects a
 *     `withFileMutex`-backed coordinator keyed on the registry path; tests
 *     inject a stub that records ordering.
 *
 * The default is a *pass-through* coordinator (runs the work with no lock),
 * so a host that does not opt into registry coordination keeps the previous
 * behaviour byte-for-byte. A host that wants the serialization passes a
 * `registryMutexPath` and gets the `withFileMutex`-backed coordinator.
 */

import { withFileMutex } from '@mcp-vertex/core/public';

export interface IWorktreeSyncCoordinator {
	/**
	 * Run a worktree mutation (`git worktree add`/`remove`) under whatever
	 * exclusion the coordinator provides, so a concurrent
	 * `syncProposalRegistry.run()` cannot interleave with it. Returns the
	 * work's result unchanged.
	 */
	runExclusive<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Pass-through coordinator: runs the work with no exclusion. The default
 * for hosts that do not coordinate worktree mutations with the registry
 * sync — behaviour is identical to calling git directly.
 */
export const createPassthroughWorktreeCoordinator =
	(): IWorktreeSyncCoordinator => ({
		runExclusive: (work) => work(),
	});

/**
 * Registry-mutex coordinator: serializes the worktree mutation against the
 * proposals registry sync by holding the SAME `withFileMutex` lock keyed on
 * the registry index path. `syncProposalRegistry` takes the same lock, so
 * the two operations are mutually exclusive: the registry sync never reads
 * a half-applied `git worktree add`.
 *
 * Order of operations per the CONC-1 acceptance: (a) take the registry
 * mutex, (b) invoke git, (c) release (handled by `withFileMutex`'s
 * `finally`).
 */
export const createFileMutexWorktreeCoordinator = (
	registryMutexPath: string,
): IWorktreeSyncCoordinator => ({
	runExclusive: (work) => withFileMutex(registryMutexPath, work),
});

/**
 * Pick the right coordinator from an optional registry path: a path opts
 * into serialization, its absence falls back to the pass-through default.
 */
export const resolveWorktreeSyncCoordinator = (
	registryMutexPath: string | undefined,
): IWorktreeSyncCoordinator =>
	registryMutexPath === undefined
		? createPassthroughWorktreeCoordinator()
		: createFileMutexWorktreeCoordinator(registryMutexPath);
