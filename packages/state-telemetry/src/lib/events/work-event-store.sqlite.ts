/**
 * work-event-store.sqlite.ts — append-only SQLite backend for the
 * Work Event Bus (q00020 F1).
 *
 * The table schema is the one declared by `q00020`:
 *
 *   work_events(
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     work_item_id TEXT NOT NULL,
 *     actor_id TEXT,
 *     kind TEXT NOT NULL,
 *     payload_hash TEXT,
 *     created_at INTEGER NOT NULL
 *   )
 *
 * Index on `(work_item_id, id)` so two writers can append at the
 * same time without tripping the autoincrement lock at the project
 * level (the bus is row-local, not scope-local).
 *
 * `Database` is created in WAL + NORMAL + 5s busy_timeout to match
 * the State Engine conventions; FK enforcement stays off because the
 * bus is deliberately append-only and has no referential integrity
 * to enforce (work_items live elsewhere in q00019).
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { Database } from 'bun:sqlite';

import {
	isWorkEventKind,
	type INewWorkEvent,
	type IWorkEvent,
} from './work-event';

export const WORK_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS work_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	work_item_id TEXT NOT NULL,
	actor_id TEXT,
	kind TEXT NOT NULL,
	payload_hash TEXT,
	created_at INTEGER NOT NULL
);
`;

export const WORK_EVENTS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_work_events_item_id
ON work_events(work_item_id, id);
`;

export const WORK_EVENTS_SCHEMA_SQL = [
	WORK_EVENTS_TABLE_SQL,
	WORK_EVENTS_INDEX_SQL,
] as const;

export const WORK_EVENTS_BOOT_PRAGMAS = [
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
	'PRAGMA foreign_keys = OFF;',
] as const;

export interface ISqliteWorkEventStoreOptions {
	readonly path: string;
	readonly now?: () => number;
}

const mapRow = (row: {
	id: number;
	work_item_id: string;
	actor_id: string | null;
	kind: string;
	payload_hash: string | null;
	created_at: number;
}): IWorkEvent => ({
	id: row.id,
	work_item_id: row.work_item_id as IWorkEvent['work_item_id'],
	actor_id: row.actor_id,
	kind: isWorkEventKind(row.kind) ? row.kind : 'git_change_stale',
	payload_hash: row.payload_hash ?? '',
	created_at: row.created_at,
});

export class SqliteWorkEventStore {
	private readonly db: Database;
	private readonly now: () => number;
	private closed = false;

	constructor(options: ISqliteWorkEventStoreOptions) {
		mkdirSync(dirname(options.path), { recursive: true });
		this.db = new Database(options.path, { create: true, strict: true });
		for (const pragma of WORK_EVENTS_BOOT_PRAGMAS) this.db.exec(pragma);
		for (const statement of WORK_EVENTS_SCHEMA_SQL) this.db.exec(statement);
		this.now = options.now ?? (() => Date.now());
	}

	append(event: INewWorkEvent): IWorkEvent {
		if (this.closed) throw new Error('SqliteWorkEventStore is closed');
		if (!isWorkEventKind(event.kind)) {
			throw new Error(`unknown work event kind: ${event.kind}`);
		}
		const createdAt = event.created_at ?? this.now();
		const result = this.db
			.prepare(
				`INSERT INTO work_events (
					work_item_id, actor_id, kind, payload_hash, created_at
				) VALUES (?, ?, ?, ?, ?)`,
			)
			.run(
				event.work_item_id,
				event.actor_id,
				event.kind,
				event.payload_hash,
				createdAt,
			);
		const id = Number(result.lastInsertRowid);
		return {
			id,
			work_item_id: event.work_item_id,
			actor_id: event.actor_id,
			kind: event.kind,
			payload_hash: event.payload_hash,
			created_at: createdAt,
		};
	}

	listByWorkItem(
		workItemId: IWorkEvent['work_item_id'],
	): readonly IWorkEvent[] {
		return this.db
			.prepare(
				`SELECT id, work_item_id, actor_id, kind, payload_hash, created_at
				 FROM work_events
				 WHERE work_item_id = ?
				 ORDER BY id ASC`,
			)
			.all(workItemId)
			.map((row) =>
				mapRow(
					row as {
						id: number;
						work_item_id: string;
						actor_id: string | null;
						kind: string;
						payload_hash: string | null;
						created_at: number;
					},
				),
			);
	}

	count(): number {
		const row = this.db
			.prepare<{ total: number }, []>(
				`SELECT COUNT(*) AS total FROM work_events`,
			)
			.get();
		return row?.total ?? 0;
	}

	close(): void {
		if (this.closed) return;
		this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
		this.db.close();
		this.closed = true;
	}
}
