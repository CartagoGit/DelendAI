/**
 * sqlite-driver.ts — q00022 S1.
 *
 * The thin wrapper around `bun:sqlite` that boots the proposals DB
 * with the right PRAGMAs (WAL, foreign_keys, busy_timeout) and runs
 * the migrations on every new connection. The driver is intentionally
 * dumb: it does not implement any business logic. The repository
 * layer is where the lifecycle / outbox / quarantine / CAS rules
 * live.
 *
 * Invariants enforced here:
 *   - `PRAGMA foreign_keys = ON` on every connection (SQLite default
 *     is OFF; without it the FK + CHECK constraints are no-ops).
 *   - WAL mode for concurrency between readers and the single writer.
 *   - busy_timeout = 5000ms so a brief lock contention retries
 *     instead of failing the user's close request.
 *   - `journal_mode = WAL` is set per connection, not via ALTER; the
 *     driver must apply it before any reads / writes happen.
 */
import { Database } from 'bun:sqlite';

import { PROPOSALS_SQLITE_SCHEMA_VERSION, SQLITE_BOOT_PRAGMAS } from './schema';
import { applyMigrations, currentSchemaVersion } from './migrations';

export interface IProposalsSqliteDriverOptions {
	readonly path: string;
	readonly readonly?: boolean;
	/**
	 * Override the migrations engine; defaults to `./migrations.ts`.
	 * Exposed for tests that want to inject a custom migrations list.
	 */
	readonly apply?: (db: Database) => {
		readonly applied: readonly { version: number; name: string }[];
	};
}

export class ProposalsSqliteDriver {
	private readonly db: Database;

	constructor(private readonly options: IProposalsSqliteDriverOptions) {
		this.db = new Database(options.path, {
			create: !options.readonly,
			strict: true,
		});
		for (const pragma of SQLITE_BOOT_PRAGMAS) {
			this.db.exec(pragma);
		}
		if (!options.readonly) {
			(options.apply ?? applyMigrations)(this.db);
		}
	}

	/** Underlying Database handle. The repository layer uses this directly. */
	get handle(): Database {
		return this.db;
	}

	get schemaVersion(): number {
		return currentSchemaVersion(this.db);
	}

	static get targetSchemaVersion(): number {
		return PROPOSALS_SQLITE_SCHEMA_VERSION;
	}

	close(): void {
		this.db.close();
	}
}
