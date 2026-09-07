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
	readonly leaseOwner: string | null;
	readonly leaseExpiresAt: number | null;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface IMarkInFlightArgs {
	readonly id: number;
	readonly leaseOwner: string;
	readonly leaseDurationMs: number;
	readonly now?: number;
}

export interface ISettleOutboxArgs {
	readonly id: number;
	readonly leaseOwner: string;
	readonly now?: number;
}

export interface IFailOutboxArgs extends ISettleOutboxArgs {
	readonly lastError: string;
	readonly nextAttemptAt: number;
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

export type TClaimOutboxOutcome =
	| { readonly kind: 'claimed'; readonly record: IOutboxRecord }
	| { readonly kind: 'busy'; readonly record: IOutboxRecord };

export type TSettleOutboxOutcome =
	| { readonly kind: 'settled'; readonly record: IOutboxRecord }
	| { readonly kind: 'busy'; readonly record: IOutboxRecord };

interface IStoredOutboxRow {
	readonly id: number;
	readonly idempotency_key: string;
	readonly kind: string;
	readonly payload: string;
	readonly status: TOutboxStatus;
	readonly attempts: number;
	readonly last_error: string | null;
	readonly next_attempt_at: number;
	readonly lease_owner: string | null;
	readonly lease_expires_at: number | null;
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
	leaseOwner: row.lease_owner,
	leaseExpiresAt: row.lease_expires_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const readByKey = (
	db: Database,
	idempotencyKey: string
): IOutboxRecord | null => {
	const row = db
		.query<IStoredOutboxRow, [string]>(
			`SELECT id, idempotency_key, kind, payload, status,
					attempts, last_error, next_attempt_at,
					lease_owner, lease_expires_at,
					created_at, updated_at
			 FROM outbox
			 WHERE idempotency_key = ?`
		)
		.get(idempotencyKey);
	return row ? mapRow(row) : null;
};

export class OutboxRepo {
	constructor(private readonly db: Database) {}

	enqueue(args: IEnqueueOutboxArgs): TEnqueueOutboxOutcome {
		const now = args.now ?? Date.now();
		const result = this.db
			.prepare(
				`INSERT OR IGNORE INTO outbox (
					idempotency_key, kind, payload, status,
					attempts, last_error, next_attempt_at,
					lease_owner, lease_expires_at,
					created_at, updated_at
				) VALUES (?, ?, ?, 'pending', 0, NULL, ?, NULL, NULL, ?, ?)`
			)
			.run(
				args.idempotencyKey,
				args.kind,
				args.payload,
				args.nextAttemptAt ?? now,
				now,
				now
			);

		const inserted = readByKey(this.db, args.idempotencyKey);
		if (!inserted) {
			throw new Error('outbox insert did not persist');
		}
		return {
			kind: result.changes === 0 ? 'already_enqueued' : 'enqueued',
			record: inserted,
		};
	}

	listPending(now: number): readonly IOutboxRecord[] {
		return this.db
			.query<IStoredOutboxRow, [number, number]>(
				`SELECT id, idempotency_key, kind, payload, status,
						attempts, last_error, next_attempt_at,
						lease_owner, lease_expires_at,
						created_at, updated_at
				 FROM outbox
					 WHERE (
						status = 'pending' AND next_attempt_at <= ?
					 ) OR (
						status = 'in-flight' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
					 )
				 ORDER BY next_attempt_at ASC, id ASC`
			)
			.all(now, now)
			.map(mapRow);
	}

	markInFlight(args: IMarkInFlightArgs): TClaimOutboxOutcome {
		const now = args.now ?? Date.now();
		const current = this.requireById(args.id);
		const result = this.db
			.prepare(
				`UPDATE outbox
				 SET status = 'in-flight',
					 attempts = attempts + 1,
					 lease_owner = ?,
					 lease_expires_at = ?,
					 updated_at = ?
				 WHERE id = ?
				   AND (
						(status = 'pending' AND next_attempt_at <= ?)
						OR (
							status = 'in-flight'
							AND lease_expires_at IS NOT NULL
							AND lease_expires_at <= ?
						)
				   )`
			)
			.run(
				args.leaseOwner,
				now + args.leaseDurationMs,
				now,
				args.id,
				now,
				now
			);
		const record = this.requireById(args.id);
		return result.changes === 0
			? { kind: 'busy', record: current }
			: { kind: 'claimed', record };
	}

	markDone(args: ISettleOutboxArgs): TSettleOutboxOutcome {
		return this.settleWithLease(args.id, args.leaseOwner, {
			status: 'done',
			lastError: null,
			leaseOwner: null,
			leaseExpiresAt: null,
			updatedAt: args.now ?? Date.now(),
		});
	}

	markFailed(args: IFailOutboxArgs): TSettleOutboxOutcome {
		return this.settleWithLease(args.id, args.leaseOwner, {
			status: 'failed',
			lastError: args.lastError,
			nextAttemptAt: args.nextAttemptAt,
			leaseOwner: null,
			leaseExpiresAt: null,
			updatedAt: args.now ?? Date.now(),
		});
	}

	private settleWithLease(
		id: number,
		leaseOwner: string,
		args: {
			readonly status: TOutboxStatus;
			readonly lastError?: string | null;
			readonly nextAttemptAt?: number;
			readonly leaseOwner?: string | null;
			readonly leaseExpiresAt?: number | null;
			readonly updatedAt: number;
		}
	): TSettleOutboxOutcome {
		const current = this.requireById(id);
		const result = this.db
			.prepare(
				`UPDATE outbox
				 SET status = ?,
					 last_error = ?,
					 next_attempt_at = ?,
					 lease_owner = ?,
					 lease_expires_at = ?,
					 updated_at = ?
				 WHERE id = ?
				   AND status = 'in-flight'
				   AND lease_owner = ?`
			)
			.run(
				args.status,
				args.lastError === undefined ? current.lastError : args.lastError,
				args.nextAttemptAt ?? current.nextAttemptAt,
				args.leaseOwner === undefined ? current.leaseOwner : args.leaseOwner,
				args.leaseExpiresAt === undefined
					? current.leaseExpiresAt
					: args.leaseExpiresAt,
				args.updatedAt,
				id,
				leaseOwner
			);
		const record = this.requireById(id);
		return result.changes === 0
			? { kind: 'busy', record: current }
			: { kind: 'settled', record };
	}

	private updateStatus(
		id: number,
		args: {
			readonly status: TOutboxStatus;
			readonly attemptsDelta?: number;
			readonly lastError?: string | null;
			readonly nextAttemptAt?: number;
			readonly leaseOwner?: string | null;
			readonly leaseExpiresAt?: number | null;
			readonly updatedAt: number;
		}
	): IOutboxRecord {
		const current = this.requireById(id);
		this.db
			.prepare(
				`UPDATE outbox
				 SET status = ?,
					 attempts = ?,
					 last_error = ?,
					 next_attempt_at = ?,
					 lease_owner = ?,
					 lease_expires_at = ?,
					 updated_at = ?
				 WHERE id = ?`
			)
			.run(
				args.status,
				current.attempts + (args.attemptsDelta ?? 0),
				args.lastError === undefined
					? current.lastError
					: args.lastError,
				args.nextAttemptAt ?? current.nextAttemptAt,
				args.leaseOwner === undefined
					? current.leaseOwner
					: args.leaseOwner,
				args.leaseExpiresAt === undefined
					? current.leaseExpiresAt
					: args.leaseExpiresAt,
				args.updatedAt,
				id
			);
		return this.requireById(id);
	}

	private requireById(id: number): IOutboxRecord {
		const row = this.db
			.query<IStoredOutboxRow, [number]>(
				`SELECT id, idempotency_key, kind, payload, status,
						attempts, last_error, next_attempt_at,
						lease_owner, lease_expires_at,
						created_at, updated_at
				 FROM outbox
				 WHERE id = ?`
			)
			.get(id);
		if (!row) {
			throw new Error(`Unknown outbox id: ${String(id)}`);
		}
		return mapRow(row);
	}
}
