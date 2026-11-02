/**
 * lifecycle-state.interface.ts
 *
 * Where a workspace records which layout epoch of a persisted area it has
 * been carried to. The area is a "scope" (the cache layout today). Lives
 * in `@delendai/state` because both the file-backed store in core and the
 * SQLite store in `@delendai/state-sqlite` implement it, and neither
 * package depends on the other.
 *
 * The epoch is its own axis: it is not the SQLite schema version and not
 * a store's schema version.
 */

export type ILifecycleScope = 'cache-layout';

export interface ILifecycleStateStore {
	/** The epoch last carried to completion, or `null` if none was. */
	getAppliedEpoch(scope: ILifecycleScope): Promise<number | null>;
	/** Record that a scope reached an epoch. Called only after the last step. */
	setAppliedEpoch(scope: ILifecycleScope, epoch: number): Promise<void>;
	/**
	 * Run `fn` while no other process or agent runs a migration over the
	 * same store. The lock is exclusive; a second caller waits for the
	 * first, then sees the epoch it recorded.
	 */
	withMigrationLock<T>(fn: () => Promise<T>): Promise<T>;
}
