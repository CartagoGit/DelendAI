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
	idempotencyKey: string,
): IMutationCommandRecord | null => {
	const row = db
		.query<IStoredMutationCommandRow, [string, string]>(
			`SELECT id, command_name, idempotency_key, request_fingerprint,
					entity_type, entity_uid, revision_before, revision_after,
					outcome_kind, response_json, status, actor, source,
					created_at, completed_at
			 FROM mutation_commands
			 WHERE command_name = ? AND idempotency_key = ?`,
		)
		.get(commandName, idempotencyKey);
	return row ? mapRow(row) : null;
};

export class MutationCommandsRepo {
	constructor(private readonly db: Database) {}

	/**
	 * Take ownership of one command key, or find out who already has it.
	 *
	 * WHY a single statement and not read-then-insert: the previous
	 * version read the row, decided there was none, and inserted. Between
	 * those two steps another connection can insert the same key — and
	 * then this one does not get a verdict, it gets a UNIQUE constraint
	 * exception out of the middle of a lifecycle verb. Both callers
	 * believed they were starting the command, which is exactly the
	 * double effect receipts exist to prevent.
	 *
	 * `ON CONFLICT … DO NOTHING RETURNING` decides it in one atomic step:
	 * a row comes back only for the caller whose insert actually
	 * happened. Everyone else gets nothing, and reads the winner's row to
	 * learn whether this is a replay of their own request or somebody
	 * else's different one.
	 *
	 * That follow-up read is safe for the same reason it is in
	 * `revision-cas`: nothing was written, so there is no race with our
	 * own work.
	 */
	claim(args: IClaimMutationCommandArgs): TClaimMutationCommandOutcome {
		const now = args.now ?? Date.now();
		const inserted = this.db
			.prepare<{ id: number }, (string | number | null)[]>(
				`INSERT INTO mutation_commands (
					command_name, idempotency_key, request_fingerprint,
					entity_type, entity_uid, revision_before, status,
					actor, source, created_at
				) VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?)
				ON CONFLICT(command_name, idempotency_key) DO NOTHING
				RETURNING id`,
			)
			.get(
				args.commandName,
				args.idempotencyKey,
				args.requestFingerprint,
				args.entityType,
				args.entityUid,
				args.revisionBefore ?? null,
				args.actor ?? null,
				args.source ?? null,
				now,
			);

		const stored = readByCommandKey(
			this.db,
			args.commandName,
			args.idempotencyKey,
		);
		if (!stored) {
			// The key is neither ours nor anybody's: the row we just
			// inserted, or the one that beat us to it, has vanished.
			// Saying so beats returning a verdict we cannot support.
			throw new Error(
				`mutation_commands: ${args.commandName}/${args.idempotencyKey} could not be read back after claiming it.`,
			);
		}
		if (inserted !== null) return { kind: 'started', command: stored };
		return stored.requestFingerprint === args.requestFingerprint
			? { kind: 'replayed', command: stored }
			: { kind: 'conflict', command: stored };
	}

	complete(args: ICompleteMutationCommandArgs): IMutationCommandRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`UPDATE mutation_commands
				 SET revision_after = ?, outcome_kind = ?, response_json = ?,
					 status = ?, completed_at = ?
				 WHERE id = ?`,
			)
			.run(
				args.revisionAfter ?? null,
				args.outcomeKind,
				args.responseJson,
				args.failed === true ? 'failed' : 'completed',
				now,
				args.id,
			);
		const row = this.db
			.query<IStoredMutationCommandRow, [number]>(
				`SELECT id, command_name, idempotency_key, request_fingerprint,
						entity_type, entity_uid, revision_before, revision_after,
						outcome_kind, response_json, status, actor, source,
						created_at, completed_at
				 FROM mutation_commands
				 WHERE id = ?`,
			)
			.get(args.id);
		if (!row) {
			throw new Error(`Unknown mutation command id: ${String(args.id)}`);
		}
		return mapRow(row);
	}
}
