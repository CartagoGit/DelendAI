import type { Database } from 'bun:sqlite';

import { LifecycleRepo } from './lifecycle-repo';
import { receiptGate, settlerFor } from './mutation-receipt.service';
import { casUpdate } from './revision-cas.service';
import {
	MutationCommandsRepo,
	resolveMutationCommandIdentity,
} from './mutation-commands-repo';
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
			const commandIdentity = resolveMutationCommandIdentity({
				commandName: 'transition-slice',
				entityType: 'slice',
				entityUid: args.uid,
				targetStatus: args.toStatus,
				...(args.expectedRevision !== undefined
					? { expectedRevision: args.expectedRevision }
					: {}),
				...(args.idempotencyKey !== undefined
					? { idempotencyKey: args.idempotencyKey }
					: {}),
				...(args.requestFingerprint !== undefined
					? { requestFingerprint: args.requestFingerprint }
					: {}),
			});
			const command = commandIdentity
				? mutationCommands.claim({
						commandName: 'transition-slice',
						...commandIdentity,
						entityType: 'slice',
						entityUid: args.uid,
						revisionBefore: current.revision,
						actor: args.actor,
						source: args.source,
						now,
					})
				: null;
			const gate = receiptGate<TTransitionSliceOutcome>({
				claim: command,
				idempotencyKey: args.idempotencyKey,
				onConflict: (reason) => ({
					kind: 'idempotency_conflict',
					reason,
				}),
			});
			if (gate.kind === 'settled') {
				outcome = gate.outcome;
				return;
			}
			// One place to record the receipt and return, built by
			// `settlerFor` rather than written out here: three
			// identical copies of this closure is how a fix to one
			// repository stops reaching the other two.
			const settle = settlerFor<TTransitionSliceOutcome>({
				claim: command,
				now,
				complete: (call) => mutationCommands.complete(call),
			});
			// BEFORE the convenience guards, on purpose. A caller that
			// supplied `expectedRevision` asked to be told when its view
			// is stale; answering `already_in_state` first gives it the
			// outcome it wanted while hiding that somebody else got there
			// on a revision it never saw. Found by racing two connections
			// through the real verb: the loser was told `already_closed`.
			if (
				args.expectedRevision !== undefined &&
				current.revision !== args.expectedRevision
			) {
				outcome = settle(
					{
						kind: 'conflict',
						slice: current,
						currentRevision: current.revision,
					},
					current.revision,
				);
				return;
			}
			if (current.status === args.toStatus) {
				outcome = settle(
					{ kind: 'already_in_state', slice: current },
					current.revision,
				);
				return;
			}
			if (!SLICE_STATUS_TRANSITIONS[current.status].has(args.toStatus)) {
				outcome = settle(
					{
						kind: 'invalid_transition',
						reason: `cannot transition slice ${args.uid} from ${current.status} to ${args.toStatus}`,
					},
					current.revision,
				);
				return;
			}

			const nextClosedAt = TERMINAL_STATUSES.has(args.toStatus)
				? (current.closedAt ?? now)
				: null;
			// Through `casUpdate` rather than a bare UPDATE, so the three
			// tables that carry a revision bump it in exactly one place.
			// The enclosing `BEGIN IMMEDIATE` already makes the
			// read-then-write atomic against other writers; what the
			// helper adds is that the precondition lives in the statement
			// itself and the verdict comes from `RETURNING` rather than
			// `changes` — which on `proposals` counts the FTS5 mirror
			// triggers and reports 10 for a single-row update.
			const swap = casUpdate(this.db, {
				table: 'slices',
				uid: current.uid,
				expectedRevision: current.revision,
				patch: {
					status: args.toStatus,
					updated_at: now,
					closed_at: nextClosedAt,
				},
			});
			if (swap.kind !== 'updated') {
				// Unreachable while the transaction is IMMEDIATE — and
				// answered honestly rather than assumed away, because the
				// day somebody makes it deferred this is the difference
				// between a reported conflict and a silent overwrite.
				outcome = settle(
					swap.kind === 'missing'
						? {
								kind: 'invalid_transition',
								reason: `slice ${args.uid} vanished mid-transition`,
							}
						: {
								kind: 'conflict',
								slice: current,
								currentRevision: swap.currentRevision,
							},
					current.revision,
				);
				return;
			}
			const nextRevision = swap.revision;
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
			outcome = settle(
				{
					kind: 'transitioned',
					slice: updated,
					outbox: outbox.record,
				},
				updated.revision,
			);
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
		let outcome: TCloseSliceOutcome;
		if (transitioned.kind === 'already_in_state') {
			outcome = { kind: 'already_closed', slice: transitioned.slice };
		} else if (transitioned.kind === 'transitioned') {
			outcome = {
				kind: 'closed',
				slice: transitioned.slice,
				outbox: transitioned.outbox,
			};
		} else {
			outcome = transitioned;
		}
		if (
			args.idempotencyKey !== undefined &&
			outcome.kind !== 'idempotency_conflict'
		) {
			new MutationCommandsRepo(this.db).completeByKey({
				commandName: 'transition-slice',
				idempotencyKey: args.idempotencyKey,
				...('slice' in outcome
					? { revisionAfter: outcome.slice.revision }
					: {}),
				outcomeKind: outcome.kind,
				responseJson: JSON.stringify(outcome),
				...(args.now !== undefined ? { now: args.now } : {}),
			});
		}
		return outcome;
	}
}
