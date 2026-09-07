import type { Database } from 'bun:sqlite';

export interface IMutationCommandRecord {
	readonly id: number;
	readonly commandName: string;
	readonly idempotencyKey: string;
	readonly requestFingerprint: string;
	readonly entityType: 'proposal' | 'plan' | 'slice';
	readonly entityUid: string;
	readonly revisionBefore: number | null;
	readonly revisionAfter: number | null;
	readonly outcomeKind: string | null;
	readonly responseJson: string | null;
	readonly status: 'started' | 'completed' | 'failed';
	readonly actor: string | null;
	readonly source: string | null;
	readonly createdAt: number;
	readonly completedAt: number | null;
}

export interface IClaimMutationCommandArgs {
	readonly commandName: string;
	readonly idempotencyKey: string;
	readonly requestFingerprint: string;
	readonly entityType: IMutationCommandRecord['entityType'];
	readonly entityUid: string;
	readonly revisionBefore?: number | null;
	readonly actor?: string;
	readonly source?: string;
	readonly now?: number;
}

export interface ICompleteMutationCommandArgs {
	readonly id: number;
	readonly revisionAfter?: number | null;
	readonly outcomeKind: string;
	readonly responseJson: string;
	readonly failed?: boolean;
	readonly now?: number;
}

export type TClaimMutationCommandOutcome =
	| { readonly kind: 'started'; readonly command: IMutationCommandRecord }
	| { readonly kind: 'replayed'; readonly command: IMutationCommandRecord }
	| {
			readonly kind: 'conflict';
			readonly command: IMutationCommandRecord;
	  };

interface IStoredMutationCommandRow {
	readonly id: number;
	readonly command_name: string;
	readonly idempotency_key: string;
	readonly request_fingerprint: string;
	readonly entity_type: 'proposal' | 'plan' | 'slice';
	readonly entity_uid: string;
	readonly revision_before: number | null;
	readonly revision_after: number | null;
	readonly outcome_kind: string | null;
	readonly response_json: string | null;
	readonly status: 'started' | 'completed' | 'failed';
	readonly actor: string | null;
	readonly source: string | null;
	readonly created_at: number;
	readonly completed_at: number | null;
}

const mapRow = (row: IStoredMutationCommandRow): IMutationCommandRecord => ({
	id: row.id,
	commandName: row.command_name,
	idempotencyKey: row.idempotency_key,
	requestFingerprint: row.request_fingerprint,
	entityType: row.entity_type,
	entityUid: row.entity_uid,
	revisionBefore: row.revision_before,
	revisionAfter: row.revision_after,
	outcomeKind: row.outcome_kind,
	responseJson: row.response_json,
	status: row.status,
	actor: row.actor,
	source: row.source,
	createdAt: row.created_at,
	completedAt: row.completed_at,
});

const readByCommandKey = (
	db: Database,
	commandName: string,
	idempotencyKey: string
): IMutationCommandRecord | null => {
	const row = db
		.query<IStoredMutationCommandRow, [string, string]>(
			`SELECT id, command_name, idempotency_key, request_fingerprint,
					entity_type, entity_uid, revision_before, revision_after,
					outcome_kind, response_json, status, actor, source,
					created_at, completed_at
			 FROM mutation_commands
			 WHERE command_name = ? AND idempotency_key = ?`
		)
		.get(commandName, idempotencyKey);
	return row ? mapRow(row) : null;
};

export class MutationCommandsRepo {
	constructor(private readonly db: Database) {}

	claim(args: IClaimMutationCommandArgs): TClaimMutationCommandOutcome {
		const now = args.now ?? Date.now();
		const existing = readByCommandKey(
			this.db,
			args.commandName,
			args.idempotencyKey
		);
		if (existing) {
			return existing.requestFingerprint === args.requestFingerprint
				? { kind: 'replayed', command: existing }
				: { kind: 'conflict', command: existing };
		}

		this.db
			.prepare(
				`INSERT INTO mutation_commands (
					command_name, idempotency_key, request_fingerprint,
					entity_type, entity_uid, revision_before, status,
					actor, source, created_at
				) VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?)`
			)
			.run(
				args.commandName,
				args.idempotencyKey,
				args.requestFingerprint,
				args.entityType,
				args.entityUid,
				args.revisionBefore ?? null,
				args.actor ?? null,
				args.source ?? null,
				now
			);

		const inserted = readByCommandKey(
			this.db,
			args.commandName,
			args.idempotencyKey
		);
		if (!inserted) {
			throw new Error('mutation_commands insert did not persist');
		}
		return { kind: 'started', command: inserted };
	}

	complete(args: ICompleteMutationCommandArgs): IMutationCommandRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`UPDATE mutation_commands
				 SET revision_after = ?, outcome_kind = ?, response_json = ?,
					 status = ?, completed_at = ?
				 WHERE id = ?`
			)
			.run(
				args.revisionAfter ?? null,
				args.outcomeKind,
				args.responseJson,
				args.failed === true ? 'failed' : 'completed',
				now,
				args.id
			);
		const row = this.db
			.query<IStoredMutationCommandRow, [number]>(
				`SELECT id, command_name, idempotency_key, request_fingerprint,
						entity_type, entity_uid, revision_before, revision_after,
						outcome_kind, response_json, status, actor, source,
						created_at, completed_at
				 FROM mutation_commands
				 WHERE id = ?`
			)
			.get(args.id);
		if (!row) {
			throw new Error(`Unknown mutation command id: ${String(args.id)}`);
		}
		return mapRow(row);
	}
}
