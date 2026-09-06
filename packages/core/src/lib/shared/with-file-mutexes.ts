/**
 * with-file-mutexes.ts — multi-path critical section.
 *
 * x00516 / B1 race fix: `safeRename(fromAbs, toAbs)` (and its
 * consumers `proposal-transition.tool.ts`, `recovery-tools.ts`,
 * `sync-proposal-registry.ts`) previously held a single-path
 * mutex on `fromAbs` only. Two concurrent operations could each
 * lock their own source, race through `safeRename`'s
 * check-then-act, and the second `rename` would clobber the
 * first. The fix is to hold a single critical section over
 * BOTH the source and destination paths.
 *
 * `withFileMutexes` sorts the path set lexicographically before
 * acquisition so two callers with reversed orderings (A locks
 * `[src, dst]`, B locks `[dst, src]`) cannot deadlock. The single-
 * path `withFileMutex` already short-circuits nested calls via the
 * `AsyncLocalStorage` reentrance guard, so a function wrapped
 * inside `withFileMutexes` that internally calls `withFileMutex`
 * on one of the fan-in paths does not self-deadlock.
 *
 * The primitive composes the existing `withFileMutex` one path at
 * a time. Each call goes through the normal acquire/heartbeat/
 * release cycle; the only new behaviour is the multi-path fan-in.
 *
 * @example
 *   await withFileMutexes([fromAbs, toAbs].sort(), async () => {
 *     await safeRename(fromAbs, toAbs);
 *   });
 *
 * @example two writers, reversed orderings, no deadlock
 *   // task A
 *   await withFileMutexes([srcA, dst].sort(), …);
 *   // task B (different source, same destination)
 *   await withFileMutexes([srcB, dst].sort(), …);
 *   // The two critical sections serialise; exactly one
 *   // `safeRename` succeeds; the other raises
 *   // `SafeRenameTargetExistsError`.
 */
import { withFileMutex, type IFileMutexOptions } from './with-file-mutex';

/**
 * Execute `fn` while holding mutexes over every path in `paths`.
 *
 * The path list is deduplicated and sorted lexicographically before
 * acquisition; callers MUST NOT rely on a specific order (the sort
 * is the anti-deadlock convention). Paths that are equal after
 * normalisation are coalesced.
 *
 * On exit (success or throw), all paths are released in reverse
 * order. If releasing a path throws, the error is swallowed
 * (consistent with `withFileMutex`'s release-error behaviour) so a
 * mid-loop release failure cannot prevent the remaining releases.
 *
 * Implementation: each path is acquired via `withFileMutex` in the
 * order they appear in the **sorted** list. The reentrance guard
 * (`AsyncLocalStorage<Set<string>>`) inside `withFileMutex` keeps
 * the fan-in acquisition from self-deadlocking — every successive
 * `withFileMutex(pathN, …)` runs while the previous path's lock is
 * still held (its callback hasn't returned), so the inner call
 * sees the path already held and short-circuits. The `fn` body
 * runs inside the innermost `withFileMutex` callback, where every
 * lock is held. When the innermost callback returns, every lock
 * releases in reverse order via the existing `withFileMutex` teardown.
 */
export const withFileMutexes = async <T>(
	paths: readonly string[],
	fn: () => Promise<T>,
	options: IFileMutexOptions = {},
): Promise<T> => {
	const sorted = [...new Set(paths)].sort();
	if (sorted.length === 0) return await fn();
	if (sorted.length === 1) {
		// single-path case: forward to the original primitive; no
		// fan-in bookkeeping needed.
		return await withFileMutex(sorted[0]!, fn, options);
	}
	// Build a chain of nested `withFileMutex` calls. The innermost
	// callback is `fn`; every outer callback acquires the next path
	// (which the reentrance guard detects as already-held when its
	// own `withFileMutex` was the acquirer).
	const buildChain =
		(i: number): (() => Promise<T>) =>
		async () => {
			if (i === sorted.length - 1) {
				return await fn();
			}
			const next = buildChain(i + 1);
			// Reentrance: when `withFileMutex(sorted[i], …)` is invoked
			// while the OUTER `withFileMutex` already holds `sorted[i]`
			// (because we're inside the outer callback), the inner call
			// short-circuits via the reentrance guard — no double
			// acquisition, no deadlock.
			return await withFileMutex(sorted[i]!, next, options);
		};
	return await withFileMutex(sorted[0]!, buildChain(1), options);
};
