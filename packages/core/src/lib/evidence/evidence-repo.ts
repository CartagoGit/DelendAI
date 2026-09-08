/**
 * evidence-repo.ts — f00533 S1.
 *
 * Thin repository over the `evidence` table. Three operations, all
 * synchronous because `bun:sqlite` is synchronous and wrapping it in
 * promises would only buy a false sense of concurrency.
 *
 *   append(entry)        one row, returns the assigned id
 *   listByType(type)     newest first, optionally limited
 *   prune(policy)        bounded by age AND/OR by row count
 *
 * `prune` is the whole point of the proposal: the file backend could
 * only express "older than N days", so nothing was ever evicted until
 * it aged out, and the steady state was ~80.000 files / ~600 MB.
 * `keepLastN` gives the store a hard ceiling that does not depend on
 * how fast events arrive.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createRequire } from 'node:module';

import type { Database } from 'bun:sqlite';

/**
 * `bun:sqlite` is loaded through `createRequire`, never as a static
 * import, and only after confirming we are on Bun.
 *
 * `packages/core` sits under nearly every module graph in the repo,
 * including the ones the canonical test runner (`bun run test` →
 * `vitest run` → node) loads. A static `import { Database } from
 * 'bun:sqlite'` here is unresolvable to node's ESM loader, and because
 * resolution failure happens at link time it takes down every spec
 * that transitively reaches core — 31 of 47 files in a single plugin
 * project — with ERR_MODULE_NOT_FOUND and zero tests run.
 *
 * The type import above is erased at compile time and costs nothing.
 * Only the runtime binding is deferred, so the module graph stays
 * static and callers keep their synchronous signatures: under node
 * this returns null and `createEvidenceStore` degrades to the
 * one-file-per-event backend, which is exactly the fallback the
 * facade already implements for a database that will not open.
 */
type TSqliteModule = { readonly Database: new (
	path: string,
	options?: { readonly create?: boolean },
) => Database };

export const loadSqlite = (): TSqliteModule | null => {
	if (typeof (globalThis as { Bun?: unknown }).Bun === 'undefined') {
		return null;
	}
	try {
		return createRequire(import.meta.url)('bun:sqlite') as TSqliteModule;
	} catch {
		return null;
	}
};

import type { EvidenceType } from '../contracts/interfaces/evidence.interface';

import {
	EVIDENCE_BOOT_PRAGMAS,
	EVIDENCE_SCHEMA_SQL,
} from './evidence-sqlite-schema';

export interface IEvidenceAppend {
	readonly type: EvidenceType;
	/** Epoch milliseconds. */
	readonly recordedAt: number;
	/** Already-serialised JSON envelope. */
	readonly payload: string;
	/**
	 * Migrator idempotency key (`<type>/<file name>`). Omit for live
	 * appends; a repeated key is silently ignored.
	 */
	readonly sourceKey?: string | undefined;
}

export interface IEvidenceRow {
	readonly id: number;
	readonly type: string;
	readonly recordedAt: number;
	readonly payload: string;
	readonly sourceKey: string | null;
}

/**
 * Age and/or count bound. Both may be given; they are applied in that
 * order (age first, then the ceiling), so a burst that is younger
 * than `olderThanDays` is still capped by `keepLastN`.
 */
export interface IEvidencePrunePolicy {
	/** Delete rows whose `recorded_at` is older than this many days. */
	readonly olderThanDays?: number | undefined;
	/** Keep only the `n` most recent rows in scope, delete the rest. */
	readonly keepLastN?: number | undefined;
	/** Scope both bounds to a single evidence type. Omit for global. */
	readonly type?: EvidenceType | undefined;
	/**
	 * Count what would be deleted and roll the transaction back. Exact
	 * rather than estimated: the same statements run, they just never
	 * commit. Backs the eviction registry's `dryRun` contract.
	 */
	readonly dryRun?: boolean | undefined;
}

export interface IEvidencePruneResult {
	readonly byAge: number;
	readonly byCount: number;
	readonly total: number;
}

export interface IEvidenceRepo {
	readonly dbPath: string;
	append(entry: IEvidenceAppend): number;
	appendMany(entries: readonly IEvidenceAppend[]): number;
	listByType(
		type: EvidenceType,
		options?: { readonly limit?: number | undefined },
	): readonly IEvidenceRow[];
	countByType(type: EvidenceType): number;
	count(): number;
	prune(policy: IEvidencePrunePolicy): IEvidencePruneResult;
	integrityCheck(): readonly string[];
	/** Return freed pages to the filesystem after a large prune. */
	vacuum(): void;
	close(): void;
}

export interface IEvidenceRepoOptions {
	/** Absolute path to the database file, or `:memory:`. */
	readonly path: string;
}

interface IRawRow {
	readonly id: number;
	readonly type: string;
	readonly recorded_at: number;
	readonly payload: string;
	readonly source_key: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sentinel thrown to make `bun:sqlite` roll a dry-run back. */
const rollback = Symbol('evidence-prune-dry-run');

const toRow = (raw: IRawRow): IEvidenceRow => ({
	id: raw.id,
	type: raw.type,
	recordedAt: raw.recorded_at,
	payload: raw.payload,
	sourceKey: raw.source_key,
});

export const openEvidenceDatabase = (path: string): Database => {
	const sqlite = loadSqlite();
	if (sqlite === null) {
		throw new Error(
			'evidence: bun:sqlite is unavailable on this runtime; the file backend must be used'
		);
	}
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new sqlite.Database(path, { create: true });
	for (const pragma of EVIDENCE_BOOT_PRAGMAS) db.run(pragma);
	for (const statement of EVIDENCE_SCHEMA_SQL) db.run(statement);
	return db;
};

export const createEvidenceRepo = (
	options: IEvidenceRepoOptions,
): IEvidenceRepo => {
	const db = openEvidenceDatabase(options.path);

	// `INSERT OR IGNORE` is what makes the S3 migrator idempotent:
	// a row whose `source_key` is already present is a no-op, so a
	// crash between "insert committed" and "source file deleted"
	// costs a wasted statement on the next run, never a duplicate.
	const insert = db.prepare<unknown, [string, number, string, string | null]>(
		'INSERT OR IGNORE INTO evidence (type, recorded_at, payload, source_key) VALUES (?, ?, ?, ?)',
	);
	const selectByType = db.query<IRawRow, [string, number]>(
		'SELECT id, type, recorded_at, payload, source_key FROM evidence WHERE type = ? ORDER BY recorded_at DESC, id DESC LIMIT ?',
	);
	const countByTypeStmt = db.query<{ n: number }, [string]>(
		'SELECT COUNT(*) AS n FROM evidence WHERE type = ?',
	);
	const countStmt = db.query<{ n: number }, []>(
		'SELECT COUNT(*) AS n FROM evidence',
	);

	// Age bound. The `type IS NULL OR` shape lets one prepared
	// statement serve both the global and the per-type case.
	const deleteOlderThan = db.prepare<unknown, [string | null, string | null, number]>(
		'DELETE FROM evidence WHERE (? IS NULL OR type = ?) AND recorded_at < ?',
	);
	// Count bound. `LIMIT -1 OFFSET n` is SQLite's "everything after
	// the first n rows"; deleting by id keeps the work in the index
	// instead of rescanning the table for every survivor.
	const deleteBeyondN = db.prepare<
		unknown,
		[string | null, string | null, string | null, string | null, number]
	>(
		`DELETE FROM evidence
		 WHERE (? IS NULL OR type = ?)
		   AND id IN (
		     SELECT id FROM evidence
		     WHERE (? IS NULL OR type = ?)
		     ORDER BY recorded_at DESC, id DESC
		     LIMIT -1 OFFSET ?
		   )`,
	);

	const insertMany = db.transaction((entries: readonly IEvidenceAppend[]) => {
		for (const entry of entries) {
			insert.run(
				entry.type,
				entry.recordedAt,
				entry.payload,
				entry.sourceKey ?? null,
			);
		}
		return entries.length;
	});

	return {
		dbPath: options.path,

		append(entry) {
			insert.run(
				entry.type,
				entry.recordedAt,
				entry.payload,
				entry.sourceKey ?? null,
			);
			const row = db
				.query<{ id: number }, []>('SELECT last_insert_rowid() AS id')
				.get();
			return row?.id ?? 0;
		},

		appendMany(entries) {
			if (entries.length === 0) return 0;
			insertMany(entries);
			return entries.length;
		},

		listByType(type, listOptions = {}) {
			const limit = listOptions.limit ?? -1;
			return selectByType.all(type, limit).map(toRow);
		},

		countByType(type) {
			return countByTypeStmt.get(type)?.n ?? 0;
		},

		count() {
			return countStmt.get()?.n ?? 0;
		},

		prune(policy) {
			const scope = policy.type ?? null;
			let byAge = 0;
			let byCount = 0;
			const run = db.transaction(() => {
				if (
					policy.olderThanDays !== undefined &&
					policy.olderThanDays > 0
				) {
					const threshold =
						Date.now() - policy.olderThanDays * DAY_MS;
					byAge = deleteOlderThan.run(scope, scope, threshold)
						.changes;
				}
				if (policy.keepLastN !== undefined && policy.keepLastN >= 0) {
					byCount = deleteBeyondN.run(
						scope,
						scope,
						scope,
						scope,
						policy.keepLastN,
					).changes;
				}
				if (policy.dryRun === true) throw rollback;
			});
			try {
				run();
			} catch (error) {
				// A dry run reaches here by design; anything else is a
				// real failure and must not be swallowed.
				if (error !== rollback) throw error;
			}
			return { byAge, byCount, total: byAge + byCount };
		},

		integrityCheck() {
			return db
				.query<{ integrity_check: string }, []>(
					'PRAGMA integrity_check',
				)
				.all()
				.map((row) => row.integrity_check);
		},

		vacuum() {
			// Pruning leaves the pages allocated; only VACUUM actually
			// shrinks the file an operator sees on disk.
			db.run('VACUUM');
		},

		close() {
			db.close();
		},
	};
};
