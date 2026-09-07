import type { Database } from 'bun:sqlite';

import { LifecycleRepo } from './lifecycle-repo';
import { OutboxRepo, type IOutboxRecord } from './outbox-repo';

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
	readonly status: string;
}

export interface ICreatePlanArgs {
	readonly uid: string;
	readonly proposalId: number;
	readonly slug: string;
	readonly title: string;
	readonly sourcePath?: string | null;
	readonly status?: string;
	readonly now?: number;
}

export interface ITransitionPlanArgs {
	readonly uid: string;
	readonly toStatus: string;
	readonly actor: string;
	readonly source: string;
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
	readonly status: string;
}

const TERMINAL_STATUSES = new Set(['done', 'retired', 'superseded', 'quarantined']);

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

	create(args: ICreatePlanArgs): IPlanRecord {
		const now = args.now ?? Date.now();
		const status = args.status ?? 'ready';
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
				status === 'done' ? now : null,
				status,
			);
		const row = this.getByUid(args.uid);
		if (!row) throw new Error(`plan ${args.uid} did not persist`);
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
			if (current.status === args.toStatus) {
				outcome = { kind: 'already_in_state', plan: current };
				return;
			}
			if (
				args.expectedRevision !== undefined &&
				current.revision !== args.expectedRevision
			) {
				outcome = {
					kind: 'conflict',
					plan: current,
					currentRevision: current.revision,
				};
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
				.run(args.toStatus, nextRevision, now, nextClosedAt, current.id);
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
			if (!updated) throw new Error(`plan ${args.uid} disappeared after transition`);
			outcome = { kind: 'transitioned', plan: updated, outbox: outbox.record };
		});
		tx.immediate();
		if (!outcome) throw new Error('transitionStatus produced no outcome');
		return outcome;
	}

	closePlan(args: Omit<ITransitionPlanArgs, 'toStatus'>): TClosePlanOutcome {
		const transitioned = this.transitionStatus({ ...args, toStatus: 'done' });
		if (transitioned.kind === 'already_in_state') {
			return { kind: 'already_closed', plan: transitioned.plan };
		}
		if (transitioned.kind === 'transitioned') {
			return {
				kind: 'closed',
				plan: transitioned.plan,
				outbox: transitioned.outbox,
			};
		}
		return transitioned;
	}
}