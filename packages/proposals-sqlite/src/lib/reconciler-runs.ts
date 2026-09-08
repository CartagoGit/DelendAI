import type { Database } from 'bun:sqlite';

export type TReconciliationRunStatus = 'ok' | 'degraded' | 'failed';
export type TReconciliationRunKind =
	| 'incremental'
	| 'shadow'
	| 'promote'
	| 'rebuild';

export interface IReconciliationRun {
	readonly id: number;
	readonly sourceCommit: string | null;
	readonly sourceTree: string | null;
	readonly reconcilerVersion: string;
	readonly schemaVersion: number;
	readonly startedAt: number;
	readonly completedAt: number | null;
	readonly status: TReconciliationRunStatus;
	readonly filesSeen: number;
	readonly filesChanged: number;
	readonly entitiesCreated: number;
	readonly entitiesUpdated: number;
	readonly entitiesDeleted: number;
	readonly entitiesQuarantined: number;
	readonly logicalDigest: string | null;
	readonly kind: TReconciliationRunKind;
	readonly error: string | null;
}

interface IStoredReconciliationRun {
	readonly id: number;
	readonly source_commit: string | null;
	readonly source_tree: string | null;
	readonly reconciler_version: string;
	readonly schema_version: number;
	readonly started_at: number;
	readonly completed_at: number | null;
	readonly status: TReconciliationRunStatus;
	readonly files_seen: number;
	readonly files_changed: number;
	readonly entities_created: number;
	readonly entities_updated: number;
	readonly entities_deleted: number;
	readonly entities_quarantined: number;
	readonly logical_digest: string | null;
	readonly kind: TReconciliationRunKind;
	readonly error: string | null;
}

const mapRun = (row: IStoredReconciliationRun): IReconciliationRun => ({
	id: row.id,
	sourceCommit: row.source_commit,
	sourceTree: row.source_tree,
	reconcilerVersion: row.reconciler_version,
	schemaVersion: row.schema_version,
	startedAt: row.started_at,
	completedAt: row.completed_at,
	status: row.status,
	filesSeen: row.files_seen,
	filesChanged: row.files_changed,
	entitiesCreated: row.entities_created,
	entitiesUpdated: row.entities_updated,
	entitiesDeleted: row.entities_deleted,
	entitiesQuarantined: row.entities_quarantined,
	logicalDigest: row.logical_digest,
	kind: row.kind,
	error: row.error,
});

const RUN_COLUMNS = `
	id, source_commit, source_tree, reconciler_version,
	schema_version, started_at, completed_at, status,
	files_seen, files_changed, entities_created, entities_updated,
	entities_deleted, entities_quarantined, logical_digest, kind, error`;

export const listReconciliationRuns = (
	db: Database,
	args: {
		readonly sourceCommit?: string;
		readonly kind?: TReconciliationRunKind;
	}
): readonly IReconciliationRun[] => {
	const conditions: string[] = [];
	const parameters: string[] = [];
	if (args.sourceCommit !== undefined) {
		conditions.push('source_commit = ?');
		parameters.push(args.sourceCommit);
	}
	if (args.kind !== undefined) {
		conditions.push('kind = ?');
		parameters.push(args.kind);
	}
	const where =
		conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
	return db
		.query<IStoredReconciliationRun, string[]>(
			`SELECT ${RUN_COLUMNS}
			 FROM reconciliation_runs${where}
			 ORDER BY started_at ASC, id ASC`
		)
		.all(...parameters)
		.map(mapRun);
};

export const getReconciliationRun = (
	db: Database,
	id: number
): IReconciliationRun | null => {
	const row = db
		.query<IStoredReconciliationRun, [number]>(
			`SELECT ${RUN_COLUMNS}
			 FROM reconciliation_runs
			 WHERE id = ?`
		)
		.get(id);
	return row === null ? null : mapRun(row);
};
