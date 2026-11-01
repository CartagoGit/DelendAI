/**
 * execution-root.ts — the working tree the current tool call acts in.
 *
 * A plugin builds its runners once, at registration, from the server's
 * root: `createGitRunner(ctx.workspace.root)`. Every call then runs git
 * in that one directory, whatever the call was for. A tool that declares
 * `writeRoot: 'caller-checkout'` promised the opposite — its writes land
 * in the caller's working tree — and the declaration alone changed
 * nothing: `git_commit` from an agent's worktree committed on the
 * server's branch.
 *
 * The root has to travel with the call, not with the runner, because
 * the runner outlives every call. This is an `AsyncLocalStorage` scope
 * opened once per call around the handler (`bindWriteRoot`), which
 * propagates through every await inside it. A runner asks
 * `executionRootOr(itsOwnRoot)` at the moment it spawns, so outside a
 * bound call — boot, a read-only tool, a background sweep — it behaves
 * exactly as before.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const executionRootStorage = new AsyncLocalStorage<string>();

/** Run `fn` with `root` as the working tree its effects belong to. */
export const runInExecutionRoot = <T>(root: string, fn: () => T): T =>
	executionRootStorage.run(root, fn);

/**
 * The working tree the current call acts in, or `fallback` — the
 * runner's own root — when no bound call is in progress.
 */
export const executionRootOr = (fallback: string): string =>
	executionRootStorage.getStore() ?? fallback;
