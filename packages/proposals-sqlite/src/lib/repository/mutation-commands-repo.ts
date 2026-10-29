import { createHash } from 'node:crypto';

import type { Database } from 'bun:sqlite';

import type {
	IClaimMutationCommandArgs,
	ICompleteMutationCommandArgs,
	ICompleteMutationCommandByKeyArgs,
	IMutationCommandEntityType,
	IMutationCommandIdentity,
	IMutationCommandIdentityInput,
	IMutationCommandRecord,
} from './mutation-commands-repo.interface';

export type {
	IClaimMutationCommandArgs,
	ICompleteMutationCommandArgs,
	ICompleteMutationCommandByKeyArgs,
	IMutationCommandEntityType,
	IMutationCommandIdentity,
	IMutationCommandIdentityInput,
	IMutationCommandRecord,
} from './mutation-commands-repo.interface';

/**
 * Omitting both idempotency fields preserves the legacy non-replayable path.
 * A public caller may provide only a key; the repository then fingerprints the
 * semantic command payload. A fingerprint without a key is invalid because it
 * cannot address a receipt and must never degrade silently to legacy mode.
 */
export const resolveMutationCommandIdentity = (
	input: IMutationCommandIdentityInput,
): IMutationCommandIdentity | null => {
	if (
		input.idempotencyKey === undefined &&
		input.requestFingerprint === undefined
	) {
		return null;
	}
	if (input.idempotencyKey === undefined) {
		throw new Error('requestFingerprint requires idempotencyKey');
	}
	return {
		idempotencyKey: input.idempotencyKey,
		requestFingerprint:
			input.requestFingerprint ??
			createHash('sha256')
				.update(
					JSON.stringify({
						commandName: input.commandName,
						entityType: input.entityType,
						entityUid: input.entityUid,
						targetStatus: input.targetStatus,
						expectedRevision: input.expectedRevision ?? null,
					}),
				)
				.digest('hex'),
	};
};

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
	readonly entity_type: IMutationCommandEntityType;
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

	completeByKey(
		args: ICompleteMutationCommandByKeyArgs,
	): IMutationCommandRecord {
		const command = readByCommandKey(
			this.db,
			args.commandName,
			args.idempotencyKey,
		);
		if (!command) {
			throw new Error(
				`Unknown mutation command: ${args.commandName}/${args.idempotencyKey}`,
			);
		}
		return this.complete({
			id: command.id,
			...(args.revisionAfter !== undefined
				? { revisionAfter: args.revisionAfter }
				: {}),
			outcomeKind: args.outcomeKind,
			responseJson: args.responseJson,
			...(args.failed !== undefined ? { failed: args.failed } : {}),
			...(args.now !== undefined ? { now: args.now } : {}),
		});
	}
}
