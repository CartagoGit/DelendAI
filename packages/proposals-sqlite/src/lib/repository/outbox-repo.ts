import type { Database } from 'bun:sqlite';

export type TOutboxStatus = 'pending' | 'in-flight' | 'done' | 'failed';

export interface IOutboxRecord {
	readonly id: number;
	readonly idempotencyKey: string;
	readonly kind: string;
	readonly payload: string;
	readonly status: TOutboxStatus;
	readonly attempts: number;
	readonly lastError: string | null;
	readonly nextAttemptAt: number;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface IEnqueueOutboxArgs {
	readonly idempotencyKey: string;
	readonly kind: string;
	readonly payload: string;
	readonly nextAttemptAt?: number;
	readonly now?: number;
}

export type TEnqueueOutboxOutcome =
	| { readonly kind: 'enqueued'; readonly record: IOutboxRecord }
	| { readonly kind: 'already_enqueued'; readonly record: IOutboxRecord };

interface IStoredOutboxRow {
	readonly id: number;
	readonly idempotency_key: string;
	readonly kind: string;
	readonly payload: string;
	readonly status: TOutboxStatus;
	readonly attempts: number;
	readonly last_error: string | null;
	readonly next_attempt_at: number;
	readonly created_at: number;
	readonly updated_at: number;
}

const mapRow = (row: IStoredOutboxRow): IOutboxRecord => ({
	id: row.id,
	idempotencyKey: row.idempotency_key,
	kind: row.kind,
	payload: row.payload,
	status: row.status,
	attempts: row.attempts,
	lastError: row.last_error,
	nextAttemptAt: row.next_attempt_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const readByKey = (
	db: Database,
	idempotencyKey: string,
): IOutboxRecord | null => {
	const row = db
		.query<IStoredOutboxRow, [string]>(
			`SELECT id, idempotency_key, kind, payload, status,
					attempts, last_error, next_attempt_at,
					created_at, updated_at
			 FROM outbox
			 WHERE idempotency_key = ?`,
		)
		.get(idempotencyKey);
	return row ? mapRow(row) : null;
};

export class OutboxRepo {
	constructor(private readonly db: Database) {}

	enqueue(args: IEnqueueOutboxArgs): TEnqueueOutboxOutcome {
		const now = args.now ?? Date.now();
		const existing = readByKey(this.db, args.idempotencyKey);
		if (existing) return { kind: 'already_enqueued', record: existing };

		this.db
			.prepare(
				`INSERT INTO outbox (
					idempotency_key, kind, payload, status,
					attempts, last_error, next_attempt_at,
					created_at, updated_at
				) VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?, ?)`,
			)
			.run(
				args.idempotencyKey,
				args.kind,
				args.payload,
				args.nextAttemptAt ?? now,
				now,
				now,
			);

		const inserted = readByKey(this.db, args.idempotencyKey);
		if (!inserted) {
			throw new Error('outbox insert did not persist');
		}
		return { kind: 'enqueued', record: inserted };
	}

	listPending(now: number): readonly IOutboxRecord[] {
		return this.db
			.query<IStoredOutboxRow, [number]>(
				`SELECT id, idempotency_key, kind, payload, status,
						attempts, last_error, next_attempt_at,
						created_at, updated_at
				 FROM outbox
				 WHERE status = 'pending' AND next_attempt_at <= ?
				 ORDER BY next_attempt_at ASC, id ASC`,
			)
			.all(now)
			.map(mapRow);
	}

	markInFlight(id: number, now = Date.now()): IOutboxRecord {
		return this.updateStatus(id, {
			status: 'in-flight',
			attemptsDelta: 1,
			updatedAt: now,
		});
	}

	markDone(id: number, now = Date.now()): IOutboxRecord {
		return this.updateStatus(id, {
			status: 'done',
			lastError: null,
			updatedAt: now,
		});
	}

	markFailed(args: {
		readonly id: number;
		readonly lastError: string;
		readonly nextAttemptAt: number;
		readonly now?: number;
	}): IOutboxRecord {
		return this.updateStatus(args.id, {
			status: 'failed',
			lastError: args.lastError,
			nextAttemptAt: args.nextAttemptAt,
			updatedAt: args.now ?? Date.now(),
		});
	}

	private updateStatus(
		id: number,
		args: {
			readonly status: TOutboxStatus;
			readonly attemptsDelta?: number;
			readonly lastError?: string | null;
			readonly nextAttemptAt?: number;
			readonly updatedAt: number;
		},
	): IOutboxRecord {
		const current = this.requireById(id);
		this.db
			.prepare(
				`UPDATE outbox
				 SET status = ?,
					 attempts = ?,
					 last_error = ?,
					 next_attempt_at = ?,
					 updated_at = ?
				 WHERE id = ?`,
			)
			.run(
				args.status,
				current.attempts + (args.attemptsDelta ?? 0),
				args.lastError === undefined ? current.lastError : args.lastError,
				args.nextAttemptAt ?? current.nextAttemptAt,
				args.updatedAt,
				id,
			);
		return this.requireById(id);
	}

	private requireById(id: number): IOutboxRecord {
		const row = this.db
			.query<IStoredOutboxRow, [number]>(
				`SELECT id, idempotency_key, kind, payload, status,
						attempts, last_error, next_attempt_at,
						created_at, updated_at
				 FROM outbox
				 WHERE id = ?`,
			)
			.get(id);
		if (!row) {
			throw new Error(`Unknown outbox id: ${String(id)}`);
		}
		return mapRow(row);
	}
}