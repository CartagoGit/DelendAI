/**
 * sqlite-driver.ts — q00022 S1 + x00511 S1.
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
 *   - `readonly: true` produces a TRUE read-only handle: `readonly`
 *     is forwarded to `new Database()` so the underlying SQLite
 *     connection refuses every write. (x00511 — previously the
 *     option only affected `create:`.)
 *   - `PRAGMA user_version` is written ONLY after a successful
 *     migration sweep, never as a boot PRAGMA. The authoritative
 *     schema state is `schema_migrations`; `user_version` is a
 *     fast-read hint that mirrors it. They cannot disagree. (x00511)
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

	constructor(options: IProposalsSqliteDriverOptions) {
		// x00533 — the canonical location is `.delendai/state/`, a
		// directory that need not exist yet. SQLite creates the FILE, not
		// its parent, so opening a fresh workspace failed with
		// SQLITE_CANTOPEN. Only when we are allowed to create at all: a
		// readonly handle must never bring a directory into existence as
		// a side effect of reading.
		if (!options.readonly && options.path !== ':memory:') {
			mkdirSync(dirname(options.path), { recursive: true });
		}
		// x00511 — `readonly: !!options.readonly` is forwarded so the
		// connection is a true read-only handle. Previously the option
		// only affected `create:` and the DB silently accepted writes.
		this.db = new Database(options.path, {
			readonly: !!options.readonly,
			create: !options.readonly,
			strict: true,
		});
		for (const pragma of SQLITE_BOOT_PRAGMAS) {
			this.db.exec(pragma);
		}
		if (!options.readonly) {
			(options.apply ?? applyMigrations)(this.db);
			// x00511 — stamp `user_version` after a successful migration
			// sweep so it can never get ahead of `schema_migrations`.
			// We read the post-migration authoritative version and write
			// it back. Idempotent: re-opening an up-to-date DB sets it
			// to the same value it already had.
			this.db.exec(
				`PRAGMA user_version = ${String(currentSchemaVersion(this.db))};`
			);
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
