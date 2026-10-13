import type { Database } from 'bun:sqlite';

export type TQuarantineStatus = 'pending' | 'resolved' | 'ignored';

export interface IQuarantineRecord {
	readonly id: number;
	readonly sourcePath: string;
	readonly blobSha: string;
	readonly entityGuess: string | null;
	readonly errorCode: string;
	readonly errorMessage: string;
	readonly rawMetadata: string | null;
	readonly runId: number | null;
	readonly status: TQuarantineStatus;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly resolvedAt: number | null;
	readonly resolvedBy: string | null;
	readonly resolutionNote: string | null;
}

export interface IRecordQuarantineArgs {
	readonly sourcePath: string;
	readonly blobSha: string;
	readonly errorCode: string;
	readonly errorMessage: string;
	readonly entityGuess?: string | null;
	readonly rawMetadata?: string | null;
	readonly runId: number;
	readonly now?: number;
}

export interface IResolveQuarantineArgs {
	readonly id: number;
	readonly status: Extract<TQuarantineStatus, 'resolved' | 'ignored'>;
	readonly resolvedBy: string;
	readonly resolutionNote?: string | null;
	readonly now?: number;
}

interface IStoredQuarantineRow {
	readonly id: number;
	readonly source_path: string;
	readonly blob_sha: string;
	readonly entity_guess: string | null;
	readonly error_code: string;
	readonly error_message: string;
	readonly raw_metadata: string | null;
	readonly run_id: number | null;
	readonly status: TQuarantineStatus;
	readonly created_at: number;
	readonly updated_at: number;
	readonly resolved_at: number | null;
	readonly resolved_by: string | null;
	readonly resolution_note: string | null;
}

const mapRow = (row: IStoredQuarantineRow): IQuarantineRecord => ({
	id: row.id,
	sourcePath: row.source_path,
	blobSha: row.blob_sha,
	entityGuess: row.entity_guess,
	errorCode: row.error_code,
	errorMessage: row.error_message,
	rawMetadata: row.raw_metadata,
	runId: row.run_id,
	status: row.status,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	resolvedAt: row.resolved_at,
	resolvedBy: row.resolved_by,
	resolutionNote: row.resolution_note,
});

export class QuarantineRepo {
	constructor(private readonly db: Database) {}

	record(args: IRecordQuarantineArgs): IQuarantineRecord {
		const now = args.now ?? Date.now();
		const result = this.db
			.prepare(
				`INSERT INTO quarantine (
					source_path, blob_sha, entity_guess,
					error_code, error_message, raw_metadata,
					run_id, status, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
			)
			.run(
				args.sourcePath,
				args.blobSha,
				args.entityGuess ?? null,
				args.errorCode,
				args.errorMessage,
				args.rawMetadata ?? null,
				args.runId ?? null,
				now,
				now,
			);
		return this.requireById(Number(result.lastInsertRowid));
	}

	listByStatus(status: TQuarantineStatus): readonly IQuarantineRecord[] {
		return this.db
			.query<IStoredQuarantineRow, [TQuarantineStatus]>(
				`SELECT id, source_path, blob_sha, entity_guess,
						error_code, error_message, raw_metadata,
						run_id, status, created_at, updated_at,
						resolved_at, resolved_by, resolution_note
				 FROM quarantine
				 WHERE status = ?
				 ORDER BY created_at ASC, id ASC`,
			)
			.all(status)
			.map(mapRow);
	}

	resolve(args: IResolveQuarantineArgs): IQuarantineRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`UPDATE quarantine
				 SET status = ?, updated_at = ?, resolved_at = ?,
					 resolved_by = ?, resolution_note = ?
				 WHERE id = ?`,
			)
			.run(
				args.status,
				now,
				now,
				args.resolvedBy,
				args.resolutionNote ?? null,
				args.id,
			);
		return this.requireById(args.id);
	}

	private requireById(id: number): IQuarantineRecord {
		const row = this.db
			.query<IStoredQuarantineRow, [number]>(
				`SELECT id, source_path, blob_sha, entity_guess,
						error_code, error_message, raw_metadata,
						run_id, status, created_at, updated_at,
						resolved_at, resolved_by, resolution_note
				 FROM quarantine
				 WHERE id = ?`,
			)
			.get(id);
		if (!row) {
			throw new Error(`Unknown quarantine id: ${String(id)}`);
		}
		return mapRow(row);
	}
}
