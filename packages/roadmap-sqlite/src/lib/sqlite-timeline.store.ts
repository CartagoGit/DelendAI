import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import {
	sealDrafts,
	timelineEventSchema,
	type IRoadmapResult,
	type IRoadmapTimelineDraft,
	type IRoadmapTimelineEvent,
	type IRoadmapTimelineFilter,
	type IRoadmapTimelineStore,
} from '@delendai/roadmap/public';

import {
	ROADMAP_TIMELINE_DB_FILENAME,
	SQLITE_BOOT_PRAGMAS,
} from './contracts/constants/roadmap-sqlite.constant';
import type { ISqliteTimelineStoreOptions } from './contracts/interfaces/roadmap-sqlite.interface';
import { migrateRoadmapDatabase } from './migrations.service';

/** Where the timeline database lives for a given plugin cache directory. */
export const resolveTimelineDatabasePath = (pluginCacheDir: string): string =>
	join(pluginCacheDir, ROADMAP_TIMELINE_DB_FILENAME);

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

interface IEventRow {
	readonly event_json: string;
}

/**
 * The roadmap timeline in SQLite. It answers the same contract as the
 * markdown and in-memory timelines, so a consumer cannot tell them apart;
 * what it adds is indexed lookups by entry and horizon on a long history.
 * The database is a projection: the markdown timeline and the roadmap
 * file stay the sources, and this one can be rebuilt from them.
 */
export class SqliteTimelineStore implements IRoadmapTimelineStore {
	private database: Database | undefined;

	constructor(private readonly options: ISqliteTimelineStoreOptions) {}

	async append(
		drafts: readonly IRoadmapTimelineDraft[],
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		try {
			const db = this.open();
			return db
				.transaction(
					(): IRoadmapResult<readonly IRoadmapTimelineEvent[]> => {
						const last = db
							.query(
								'SELECT MAX(seq) AS seq FROM timeline_events;',
							)
							.get() as { readonly seq: number | null } | null;
						const sealed = sealDrafts(last?.seq ?? 0, drafts);
						if (!sealed.ok) return sealed;
						const insert = db.query(
							`INSERT INTO timeline_events
(seq, at, actor, kind, horizon, entry_id, reason, event_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
						);
						for (const event of sealed.value) {
							insert.run(
								event.seq,
								event.at,
								event.actor,
								event.kind,
								event.horizon,
								event.entryId ?? null,
								event.reason,
								JSON.stringify(event),
							);
						}
						return sealed;
					},
				)
				.immediate();
		} catch (error) {
			return {
				ok: false,
				reason: `timeline database: ${describe(error)}`,
			};
		}
	}

	async list(
		filter: IRoadmapTimelineFilter = {},
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		try {
			const clauses: string[] = [];
			const values: string[] = [];
			if (filter.entryId !== undefined) {
				clauses.push('entry_id = ?');
				values.push(filter.entryId);
			}
			if (filter.horizon !== undefined) {
				clauses.push('horizon = ?');
				values.push(filter.horizon);
			}
			const where =
				clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
			const rows = this.open()
				.query(
					`SELECT event_json FROM timeline_events${where} ORDER BY seq;`,
				)
				.all(...values) as IEventRow[];
			const events: IRoadmapTimelineEvent[] = [];
			for (const row of rows) {
				const parsed = timelineEventSchema.safeParse(
					JSON.parse(row.event_json),
				);
				if (!parsed.success) {
					return {
						ok: false,
						reason: 'timeline database holds an event that is not valid',
					};
				}
				events.push(parsed.data);
			}
			return { ok: true, value: events };
		} catch (error) {
			return {
				ok: false,
				reason: `timeline database: ${describe(error)}`,
			};
		}
	}

	/** Closes the database; a later call opens it again. */
	close(): void {
		this.database?.close();
		this.database = undefined;
	}

	private open(): Database {
		if (this.database !== undefined) return this.database;
		mkdirSync(this.options.pluginCacheDir, { recursive: true });
		const db = new Database(
			resolveTimelineDatabasePath(this.options.pluginCacheDir),
			{ create: true, strict: true },
		);
		try {
			for (const pragma of SQLITE_BOOT_PRAGMAS) db.run(pragma);
			migrateRoadmapDatabase(db);
		} catch (error) {
			db.close();
			throw error;
		}
		this.database = db;
		return db;
	}
}
