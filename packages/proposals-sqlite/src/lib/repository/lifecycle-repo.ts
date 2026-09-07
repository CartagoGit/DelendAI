import type { Database } from 'bun:sqlite';

export interface ILifecycleEventRecord {
	readonly id: number;
	readonly entityType: 'proposal' | 'plan' | 'slice';
	readonly entityUid: string;
	readonly entityRevision: number;
	readonly fromStatus: string | null;
	readonly toStatus: string;
	readonly actor: string;
	readonly source: string;
	readonly occurredAt: number;
	readonly metadata: string | null;
}

export interface IAppendLifecycleEventArgs {
	readonly entityType: ILifecycleEventRecord['entityType'];
	readonly entityUid: string;
	readonly entityRevision: number;
	readonly fromStatus?: string | null;
	readonly toStatus: string;
	readonly actor: string;
	readonly source: string;
	readonly occurredAt?: number;
	readonly metadata?: string | null;
}

interface IStoredLifecycleEventRow {
	readonly id: number;
	readonly entity_type: 'proposal' | 'plan' | 'slice';
	readonly entity_uid: string;
	readonly entity_revision: number;
	readonly from_status: string | null;
	readonly to_status: string;
	readonly actor: string;
	readonly source: string;
	readonly occurred_at: number;
	readonly metadata: string | null;
}

const mapRow = (row: IStoredLifecycleEventRow): ILifecycleEventRecord => ({
	id: row.id,
	entityType: row.entity_type,
	entityUid: row.entity_uid,
	entityRevision: row.entity_revision,
	fromStatus: row.from_status,
	toStatus: row.to_status,
	actor: row.actor,
	source: row.source,
	occurredAt: row.occurred_at,
	metadata: row.metadata,
});

export class LifecycleRepo {
	constructor(private readonly db: Database) {}

	append(args: IAppendLifecycleEventArgs): ILifecycleEventRecord {
		const occurredAt = args.occurredAt ?? Date.now();
		const result = this.db
			.prepare(
				`INSERT INTO lifecycle_events (
					entity_type, entity_uid, entity_revision,
					from_status, to_status, actor, source,
					occurred_at, metadata
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				args.entityType,
				args.entityUid,
				args.entityRevision,
				args.fromStatus ?? null,
				args.toStatus,
				args.actor,
				args.source,
				occurredAt,
				args.metadata ?? null
			);
		const row = this.db
			.query<IStoredLifecycleEventRow, [number]>(
				`SELECT id, entity_type, entity_uid, entity_revision,
						from_status, to_status, actor, source,
						occurred_at, metadata
				 FROM lifecycle_events
				 WHERE id = ?`
			)
			.get(Number(result.lastInsertRowid));
		if (!row) {
			throw new Error('lifecycle_events insert did not persist');
		}
		return mapRow(row);
	}

	listForEntity(args: {
		readonly entityType: ILifecycleEventRecord['entityType'];
		readonly entityUid: string;
	}): readonly ILifecycleEventRecord[] {
		return this.db
			.query<IStoredLifecycleEventRow, [string, string]>(
				`SELECT id, entity_type, entity_uid, entity_revision,
						from_status, to_status, actor, source,
						occurred_at, metadata
				 FROM lifecycle_events
				 WHERE entity_type = ? AND entity_uid = ?
				 ORDER BY occurred_at ASC, id ASC`
			)
			.all(args.entityType, args.entityUid)
			.map(mapRow);
	}
}
