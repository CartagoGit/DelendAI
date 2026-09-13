import type { Database } from 'bun:sqlite';

import { LifecycleRepo } from './lifecycle-repo';
import { receiptGate, settlerFor } from './mutation-receipt.service';
import {
	MutationCommandsRepo,
	resolveMutationCommandIdentity,
} from './mutation-commands-repo';
import { OutboxRepo, type IOutboxRecord } from './outbox-repo';

export type TPlanStatus =
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

export interface IPlanRecord {
	readonly id: number;
	readonly uid: string;
	readonly proposalId: number;
	readonly slug: string;
	readonly title: string;
	readonly sourcePath: string | null;
	readonly revision: number;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly closedAt: number | null;
	readonly status: TPlanStatus;
}

export interface ICreatePlanArgs {
	readonly uid: string;
	readonly proposalId: number;
	readonly slug: string;
	readonly title: string;
	readonly sourcePath?: string | null;
	readonly status?: TPlanStatus;
	readonly now?: number;
}

export interface ITransitionPlanArgs {
	readonly uid: string;
	readonly toStatus: TPlanStatus;
	readonly actor: string;
	readonly source: string;
	readonly idempotencyKey?: string;
	readonly requestFingerprint?: string;
	readonly expectedRevision?: number;
	readonly now?: number;
}

export type TTransitionPlanOutcome =
	| {
			readonly kind: 'transitioned';
			readonly plan: IPlanRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'already_in_state'; readonly plan: IPlanRecord }
	| {
			readonly kind: 'conflict';
			readonly plan: IPlanRecord;
			readonly currentRevision: number;
	  }
	| { readonly kind: 'idempotency_conflict'; readonly reason: string }
	| { readonly kind: 'invalid_transition'; readonly reason: string };

export type TClosePlanOutcome =
	| {
			readonly kind: 'closed';
			readonly plan: IPlanRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'already_closed'; readonly plan: IPlanRecord }
	| {
			readonly kind: 'conflict';
			readonly plan: IPlanRecord;
			readonly currentRevision: number;
	  }
	| { readonly kind: 'idempotency_conflict'; readonly reason: string }
	| { readonly kind: 'invalid_transition'; readonly reason: string };

interface IStoredPlanRow {
	readonly id: number;
	readonly uid: string;
	readonly proposal_id: number;
	readonly slug: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly revision: number;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
	readonly status: TPlanStatus;
}

const TERMINAL_STATUSES = new Set<TPlanStatus>([
	'done',
	'retired',
	'superseded',
	'quarantined',
]);

const PLAN_STATUS_TRANSITIONS: Readonly<
	Record<TPlanStatus, ReadonlySet<TPlanStatus>>
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

const mapRow = (row: IStoredPlanRow): IPlanRecord => ({
	id: row.id,
	uid: row.uid,
	proposalId: row.proposal_id,
	slug: row.slug,
	title: row.title,
	sourcePath: row.source_path,
	revision: row.revision,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	closedAt: row.closed_at,
	status: row.status,
});

const readPlan = (db: Database, uid: string): IStoredPlanRow | null =>
	db
		.query<IStoredPlanRow, [string]>(
			`SELECT id, uid, proposal_id, slug, title, source_path,
					revision, created_at, updated_at, closed_at, status
			 FROM plans
			 WHERE uid = ?`,
		)
		.get(uid);

export class PlanRepo {
	constructor(private readonly db: Database) {}

	getByUid(uid: string): IPlanRecord | null {
		const row = readPlan(this.db, uid);
		return row ? mapRow(row) : null;
	}

	/**
	 * Idempotent by `uid` — x00539 S3.
	 *
	 * This used to be a plain INSERT, so the two markdown files that
	 * declare `id: f00418` aborted staging with `UNIQUE constraint
	 * failed: plans.uid` after 437 of 790 plans. The three Git-derived
	 * entities are now aligned on ONE rule: each upserts its
	 * projection by uid, the way `ProposalRepo.upsertProjection`
	 * already did. Projecting the same uid twice updates the row (and
	 * bumps `revision` when anything actually changed) instead of
	 * throwing; the last file wins, deterministically, because the
	 * reconciler feeds candidates in canonical uid/path order.
	 */
	create(args: ICreatePlanArgs): IPlanRecord {
		const now = args.now ?? Date.now();
		const status = args.status ?? 'ready';
		const closedAt = TERMINAL_STATUSES.has(status) ? now : null;
		const existing = this.getByUid(args.uid);
		if (existing === null) {
			this.db
				.prepare(
					`INSERT INTO plans (
						uid, proposal_id, slug, title, source_path,
						revision, created_at, updated_at, closed_at, status
					) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
				)
				.run(
					args.uid,
					args.proposalId,
					args.slug,
					args.title,
					args.sourcePath ?? null,
					now,
					now,
					closedAt,
					status,
				);
			const row = this.getByUid(args.uid);
			if (!row) throw new Error(`plan ${args.uid} did not persist`);
			return row;
		}

		const unchanged =
			existing.proposalId === args.proposalId &&
			existing.slug === args.slug &&
			existing.title === args.title &&
			existing.sourcePath === (args.sourcePath ?? null) &&
			existing.status === status;
		if (unchanged) return existing;

		this.db
			.prepare(
				`UPDATE plans
				 SET proposal_id = ?, slug = ?, title = ?, source_path = ?,
					 status = ?, revision = revision + 1,
					 updated_at = ?, closed_at = ?
				 WHERE uid = ?`,
			)
			.run(
				args.proposalId,
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
		if (!row) throw new Error(`plan ${args.uid} disappeared after upsert`);
		return row;
	}

	transitionStatus(args: ITransitionPlanArgs): TTransitionPlanOutcome {
		const now = args.now ?? Date.now();
		let outcome: TTransitionPlanOutcome | null = null;
		const tx = this.db.transaction(() => {
			const current = this.getByUid(args.uid);
			if (!current) {
				outcome = {
					kind: 'invalid_transition',
					reason: `plan ${args.uid} not found`,
				};
				return;
			}
			const mutationCommands = new MutationCommandsRepo(this.db);
			const commandIdentity = resolveMutationCommandIdentity({
				commandName: 'transition-plan',
				entityType: 'plan',
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
						commandName: 'transition-plan',
						...commandIdentity,
						entityType: 'plan',
						entityUid: args.uid,
						revisionBefore: current.revision,
						actor: args.actor,
						source: args.source,
						now,
					})
				: null;
			const gate = receiptGate<TTransitionPlanOutcome>({
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
			const settle = settlerFor<TTransitionPlanOutcome>({
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
						plan: current,
						currentRevision: current.revision,
					},
					current.revision,
				);
				return;
			}
			if (current.status === args.toStatus) {
				outcome = settle(
					{ kind: 'already_in_state', plan: current },
					current.revision,
				);
				return;
			}
			if (!PLAN_STATUS_TRANSITIONS[current.status].has(args.toStatus)) {
				outcome = settle(
					{
						kind: 'invalid_transition',
						reason: `cannot transition plan ${args.uid} from ${current.status} to ${args.toStatus}`,
					},
					current.revision,
				);
				return;
			}

			const nextRevision = current.revision + 1;
			const nextClosedAt = TERMINAL_STATUSES.has(args.toStatus)
				? (current.closedAt ?? now)
				: null;
			this.db
				.prepare(
					`UPDATE plans
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
				entityType: 'plan',
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
				idempotencyKey: `plan-transition:${current.uid}:${String(nextRevision)}`,
				kind: 'plan-transitioned',
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
					`plan ${args.uid} disappeared after transition`,
				);
			outcome = settle(
				{
					kind: 'transitioned',
					plan: updated,
					outbox: outbox.record,
				},
				updated.revision,
			);
		});
		tx.immediate();
		if (!outcome) throw new Error('transitionStatus produced no outcome');
		return outcome;
	}

	closePlan(args: Omit<ITransitionPlanArgs, 'toStatus'>): TClosePlanOutcome {
		const transitioned = this.transitionStatus({
			...args,
			toStatus: 'done',
		});
		let outcome: TClosePlanOutcome;
		if (transitioned.kind === 'already_in_state') {
			outcome = { kind: 'already_closed', plan: transitioned.plan };
		} else if (transitioned.kind === 'transitioned') {
			outcome = {
				kind: 'closed',
				plan: transitioned.plan,
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
				commandName: 'transition-plan',
				idempotencyKey: args.idempotencyKey,
				...('plan' in outcome
					? { revisionAfter: outcome.plan.revision }
					: {}),
				outcomeKind: outcome.kind,
				responseJson: JSON.stringify(outcome),
				...(args.now !== undefined ? { now: args.now } : {}),
			});
		}
		return outcome;
	}
}
