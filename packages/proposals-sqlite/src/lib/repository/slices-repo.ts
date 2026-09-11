import type { Database } from 'bun:sqlite';

import { LifecycleRepo } from './lifecycle-repo';
import { MutationCommandsRepo } from './mutation-commands-repo';
import { OutboxRepo, type IOutboxRecord } from './outbox-repo';

export type TSliceStatus =
	| 'draft'
	| 'ready'
	| 'in-progress'
	| 'review'
	| 'blocked'
	| 'paused'
	| 'done'
	| 'retired'
	| 'superseded'
	| 'quarantined';

export interface ISliceRecord {
	readonly id: number;
	readonly uid: string;
	readonly planId: number;
	readonly slug: string;
	readonly title: string;
	readonly sourcePath: string | null;
	readonly revision: number;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly closedAt: number | null;
	readonly status: TSliceStatus;
}

export interface ICreateSliceArgs {
	readonly uid: string;
	readonly planId: number;
	readonly slug: string;
	readonly title: string;
	readonly sourcePath?: string | null;
	readonly status?: TSliceStatus;
	readonly now?: number;
}

export interface ITransitionSliceArgs {
	readonly uid: string;
	readonly toStatus: TSliceStatus;
	readonly actor: string;
	readonly source: string;
	readonly idempotencyKey?: string;
	readonly requestFingerprint?: string;
	readonly expectedRevision?: number;
	readonly now?: number;
}

export type TTransitionSliceOutcome =
	| {
			readonly kind: 'transitioned';
			readonly slice: ISliceRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'already_in_state'; readonly slice: ISliceRecord }
	| {
			readonly kind: 'conflict';
			readonly slice: ISliceRecord;
			readonly currentRevision: number;
	  }
	| { readonly kind: 'idempotency_conflict'; readonly reason: string }
	| { readonly kind: 'invalid_transition'; readonly reason: string };

export type TCloseSliceOutcome =
	| {
			readonly kind: 'closed';
			readonly slice: ISliceRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'already_closed'; readonly slice: ISliceRecord }
	| {
			readonly kind: 'conflict';
			readonly slice: ISliceRecord;
			readonly currentRevision: number;
	  }
	| { readonly kind: 'idempotency_conflict'; readonly reason: string }
	| { readonly kind: 'invalid_transition'; readonly reason: string };

interface IStoredSliceRow {
	readonly id: number;
	readonly uid: string;
	readonly plan_id: number;
	readonly slug: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly revision: number;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
	readonly status: TSliceStatus;
}

const TERMINAL_STATUSES = new Set<TSliceStatus>([
	'done',
	'retired',
	'superseded',
	'quarantined',
]);

const SLICE_STATUS_TRANSITIONS: Readonly<
	Record<TSliceStatus, ReadonlySet<TSliceStatus>>
> = {
	draft: new Set([
		'ready',
		'blocked',
		'paused',
		'done',
		'retired',
		'superseded',
		'quarantined',
	]),
	ready: new Set([
		'review',
		'in-progress',
		'blocked',
		'paused',
		'done',
		'retired',
		'superseded',
		'quarantined',
	]),
	'in-progress': new Set([
		'review',
		'blocked',
		'paused',
		'done',
		'retired',
		'superseded',
		'quarantined',
	]),
	review: new Set([
		'in-progress',
		'done',
		'retired',
		'superseded',
		'quarantined',
	]),
	blocked: new Set(['ready', 'done', 'retired', 'superseded', 'quarantined']),
	paused: new Set(['ready', 'done', 'retired', 'superseded', 'quarantined']),
	done: new Set([]),
	retired: new Set([]),
	superseded: new Set([]),
	quarantined: new Set([]),
};

const mapRow = (row: IStoredSliceRow): ISliceRecord => ({
	id: row.id,
	uid: row.uid,
	planId: row.plan_id,
	slug: row.slug,
	title: row.title,
	sourcePath: row.source_path,
	revision: row.revision,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	closedAt: row.closed_at,
	status: row.status,
});

const readSlice = (db: Database, uid: string): IStoredSliceRow | null =>
	db
		.query<IStoredSliceRow, [string]>(
			`SELECT id, uid, plan_id, slug, title, source_path,
					revision, created_at, updated_at, closed_at, status
			 FROM slices
			 WHERE uid = ?`,
		)
		.get(uid);

export class SliceRepo {
	constructor(private readonly db: Database) {}

	getByUid(uid: string): ISliceRecord | null {
		const row = readSlice(this.db, uid);
		return row ? mapRow(row) : null;
	}

	/**
	 * Idempotent by `uid` — x00539 S3. Same rule as
	 * `PlanRepo.create` and `ProposalRepo.upsertProjection`: the three
	 * Git-derived entities all upsert their projection, so a duplicated
	 * id in the markdown tree updates a row instead of aborting the run
	 * with `UNIQUE constraint failed`.
	 */
	create(args: ICreateSliceArgs): ISliceRecord {
		const now = args.now ?? Date.now();
		const status = args.status ?? 'ready';
		const closedAt = TERMINAL_STATUSES.has(status) ? now : null;
		const existing = this.getByUid(args.uid);
		if (existing === null) {
			this.db
				.prepare(
					`INSERT INTO slices (
						uid, plan_id, slug, title, source_path,
						revision, created_at, updated_at, closed_at, status
					) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
				)
				.run(
					args.uid,
					args.planId,
					args.slug,
					args.title,
					args.sourcePath ?? null,
					now,
					now,
					closedAt,
					status,
				);
			const row = this.getByUid(args.uid);
			if (!row) throw new Error(`slice ${args.uid} did not persist`);
			return row;
		}

		const unchanged =
			existing.planId === args.planId &&
			existing.slug === args.slug &&
			existing.title === args.title &&
			existing.sourcePath === (args.sourcePath ?? null) &&
			existing.status === status;
		if (unchanged) return existing;

		this.db
			.prepare(
				`UPDATE slices
				 SET plan_id = ?, slug = ?, title = ?, source_path = ?,
					 status = ?, revision = revision + 1,
					 updated_at = ?, closed_at = ?
				 WHERE uid = ?`,
			)
			.run(
				args.planId,
				args.slug,
				args.title,
				args.sourcePath ?? null,
				status,
				now,
				TERMINAL_STATUSES.has(status)
					? (existing.closedAt ?? now)
					: null,
				args.uid,
			);
		const row = this.getByUid(args.uid);
		if (!row) throw new Error(`slice ${args.uid} disappeared after upsert`);
		return row;
	}

	transitionStatus(args: ITransitionSliceArgs): TTransitionSliceOutcome {
		const now = args.now ?? Date.now();
		let outcome: TTransitionSliceOutcome | null = null;
		const tx = this.db.transaction(() => {
			const current = this.getByUid(args.uid);
			if (!current) {
				outcome = {
					kind: 'invalid_transition',
					reason: `slice ${args.uid} not found`,
				};
				return;
			}
			const mutationCommands = new MutationCommandsRepo(this.db);
			const command =
				args.idempotencyKey !== undefined &&
				args.requestFingerprint !== undefined
					? mutationCommands.claim({
							commandName: 'transition-slice',
							idempotencyKey: args.idempotencyKey,
							requestFingerprint: args.requestFingerprint,
							entityType: 'slice',
							entityUid: args.uid,
							revisionBefore: current.revision,
							actor: args.actor,
							source: args.source,
							now,
						})
					: null;
			if (command?.kind === 'conflict') {
				outcome = {
					kind: 'idempotency_conflict',
					reason: `idempotency key ${args.idempotencyKey ?? ''} was already used with a different request`,
				};
				return;
			}
			if (command?.kind === 'replayed' && command.command.responseJson) {
				outcome = JSON.parse(command.command.responseJson) as TTransitionSliceOutcome;
				return;
			}
			if (current.status === args.toStatus) {
				outcome = { kind: 'already_in_state', slice: current };
				if (command?.kind === 'started') {
					mutationCommands.complete({
						id: command.command.id,
						revisionAfter: current.revision,
						outcomeKind: outcome.kind,
						responseJson: JSON.stringify(outcome),
						now,
					});
				}
				return;
			}
			if (!SLICE_STATUS_TRANSITIONS[current.status].has(args.toStatus)) {
				outcome = {
					kind: 'invalid_transition',
					reason: `cannot transition slice ${args.uid} from ${current.status} to ${args.toStatus}`,
				};
				if (command?.kind === 'started') {
					mutationCommands.complete({
						id: command.command.id,
						revisionAfter: current.revision,
						outcomeKind: outcome.kind,
						responseJson: JSON.stringify(outcome),
						now,
					});
				}
				return;
			}
			if (
				args.expectedRevision !== undefined &&
				current.revision !== args.expectedRevision
			) {
				outcome = {
					kind: 'conflict',
					slice: current,
					currentRevision: current.revision,
				};
				if (command?.kind === 'started') {
					mutationCommands.complete({
						id: command.command.id,
						revisionAfter: current.revision,
						outcomeKind: outcome.kind,
						responseJson: JSON.stringify(outcome),
						now,
					});
				}
				return;
			}

			const nextRevision = current.revision + 1;
			const nextClosedAt = TERMINAL_STATUSES.has(args.toStatus)
				? (current.closedAt ?? now)
				: null;
			this.db
				.prepare(
					`UPDATE slices
					 SET status = ?, revision = ?, updated_at = ?, closed_at = ?
					 WHERE id = ?`,
				)
				.run(
					args.toStatus,
					nextRevision,
					now,
					nextClosedAt,
					current.id,
				);
			new LifecycleRepo(this.db).append({
				entityType: 'slice',
				entityUid: current.uid,
				entityRevision: nextRevision,
				fromStatus: current.status,
				toStatus: args.toStatus,
				actor: args.actor,
				source: args.source,
				occurredAt: now,
				metadata: JSON.stringify({ action: 'transition' }),
			});
			const outbox = new OutboxRepo(this.db).enqueue({
				idempotencyKey: `slice-transition:${current.uid}:${String(nextRevision)}`,
				kind: 'slice-transitioned',
				payload: JSON.stringify({
					uid: current.uid,
					fromStatus: current.status,
					toStatus: args.toStatus,
					revision: nextRevision,
				}),
				nextAttemptAt: now,
				now,
			});
			const updated = this.getByUid(args.uid);
			if (!updated)
				throw new Error(
					`slice ${args.uid} disappeared after transition`,
				);
			outcome = {
				kind: 'transitioned',
				slice: updated,
				outbox: outbox.record,
			};
			if (command?.kind === 'started') {
				mutationCommands.complete({
					id: command.command.id,
					revisionAfter: updated.revision,
					outcomeKind: outcome.kind,
					responseJson: JSON.stringify(outcome),
					now,
				});
			}
		});
		tx.immediate();
		if (!outcome) throw new Error('transitionStatus produced no outcome');
		return outcome;
	}

	closeSlice(
		args: Omit<ITransitionSliceArgs, 'toStatus'>,
	): TCloseSliceOutcome {
		const transitioned = this.transitionStatus({
			...args,
			toStatus: 'done',
		});
		if (transitioned.kind === 'already_in_state') {
			return { kind: 'already_closed', slice: transitioned.slice };
		}
		if (transitioned.kind === 'transitioned') {
			return {
				kind: 'closed',
				slice: transitioned.slice,
				outbox: transitioned.outbox,
			};
		}
		return transitioned;
	}
}
