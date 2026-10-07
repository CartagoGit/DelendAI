import type { Database } from 'bun:sqlite';

import type { ILifecycleScope, ILifecycleStateStore } from '@delendai/state';

import { CREATE_LIFECYCLE_META_TABLE_SQL } from './schema';

interface IEpochRow {
	readonly applied_epoch: number;
}

/**
 * The lifecycle epoch kept in the state database, on the connection the
 * state engine already opened — there is no second database.
 *
 * `withMigrationLock` takes SQLite's write lock (`BEGIN IMMEDIATE`) for the
 * whole of `fn`, so a second process blocks on `busy_timeout` and then
 * reads the epoch the first one committed. Callers inside the same process
 * are queued, because one connection cannot nest a transaction.
 */
export class SqliteLifecycleStateStore implements ILifecycleStateStore {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly db: Database,
		private readonly now: () => number = Date.now,
	) {
		this.db.exec(CREATE_LIFECYCLE_META_TABLE_SQL);
	}

	async getAppliedEpoch(scope: ILifecycleScope): Promise<number | null> {
		const row = this.db
			.query('SELECT applied_epoch FROM lifecycle_meta WHERE scope = ?;')
			.get(scope) as IEpochRow | null;
		return row === null ? null : row.applied_epoch;
	}

	async setAppliedEpoch(
		scope: ILifecycleScope,
		epoch: number,
	): Promise<void> {
		this.db
			.query(
				`INSERT INTO lifecycle_meta (scope, applied_epoch, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(scope) DO UPDATE SET
					applied_epoch = excluded.applied_epoch,
					updated_at = excluded.updated_at;`,
			)
			.run(scope, epoch, this.now());
	}

	withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
		const run = async (): Promise<T> => {
			this.db.exec('BEGIN IMMEDIATE;');
			try {
				const result = await fn();
				this.db.exec('COMMIT;');
				return result;
			} catch (error) {
				this.db.exec('ROLLBACK;');
				throw error;
			}
		};
		const next = this.queue.then(run, run);
		this.queue = next.catch(() => undefined);
		return next;
	}
}
