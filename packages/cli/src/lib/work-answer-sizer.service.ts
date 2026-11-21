/**
 * work-answer-sizer.service.ts — loads the modules a `work` verb needs after
 * its unit's worktree is gone, once, before the worktree can be removed.
 *
 * The last submit removes the unit worktree. A module imported lazily from it
 * afterwards fails with ENOENT and the end-of-run answer (pull request,
 * review transition) is lost. The verbs that can end a unit start the load up
 * front, so the import resolves while the files still exist; every later use
 * awaits the same promise.
 */

import type { ILoadedOnce } from '../contracts/interfaces/loaded-once.interface';

/** Loads `load` at most once, and on `preload()` rather than on first use. */
export const loadedOnce = <T>(load: () => Promise<T>): ILoadedOnce<T> => {
	let pending: Promise<T> | undefined;
	const get = (): Promise<T> => {
		pending ??= load();
		return pending;
	};
	return {
		preload: () => {
			// An unused failed load must not become an unhandled rejection.
			get().catch(() => undefined);
		},
		get,
	};
};
