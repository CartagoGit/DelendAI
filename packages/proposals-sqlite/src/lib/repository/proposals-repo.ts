import type { Database } from 'bun:sqlite';

import type { IProposalCandidate } from '../reconciler';
import {
	VocabularyViolationError,
	normalizeLifecycleStatus,
	normalizeProposalKind,
} from '../vocabulary';
import { LifecycleRepo } from './lifecycle-repo';
import { completeReceipt, receiptGate } from './mutation-receipt.service';
import {
	MutationCommandsRepo,
	resolveMutationCommandIdentity,
} from './mutation-commands-repo';
import { OutboxRepo, type IOutboxRecord } from './outbox-repo';

export interface IProposalRecord {
	readonly id: number;
	readonly uid: string;
	readonly slug: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly sourcePath: string | null;
	readonly sourceBlobSha: string | null;
	readonly revision: number;
	readonly contentHash: string | null;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly closedAt: number | null;
}

export type IUpsertProposalProjectionOutcome =
	| {
			readonly kind: 'created';
			readonly proposal: IProposalRecord;
			readonly outbox: IOutboxRecord;
	  }
	| {
			readonly kind: 'updated';
			readonly proposal: IProposalRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'unchanged'; readonly proposal: IProposalRecord };

export interface ICloseProposalArgs {
	readonly uid: string;
	readonly actor: string;
	readonly source: string;
	readonly idempotencyKey?: string;
	readonly requestFingerprint?: string;
	readonly expectedRevision?: number;
	readonly now?: number;
}

export type TCloseProposalOutcome =
	| {
			readonly kind: 'closed';
			readonly proposal: IProposalRecord;
			readonly outbox: IOutboxRecord;
	  }
	| { readonly kind: 'already_closed'; readonly proposal: IProposalRecord }
	| {
			readonly kind: 'conflict';
			readonly proposal: IProposalRecord;
			readonly currentRevision: number;
	  }
	| { readonly kind: 'idempotency_conflict'; readonly reason: string }
	| { readonly kind: 'invalid_transition'; readonly reason: string };

interface IStoredProposalRow {
	readonly id: number;
	readonly uid: string;
	readonly slug: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly source_blob_sha: string | null;
	readonly revision: number;
	readonly content_hash: string | null;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
}

const mapRow = (row: IStoredProposalRow): IProposalRecord => ({
	id: row.id,
	uid: row.uid,
	slug: row.slug,
	kind: row.kind,
	status: row.status,
	title: row.title,
	sourcePath: row.source_path,
	sourceBlobSha: row.source_blob_sha,
	revision: row.revision,
	contentHash: row.content_hash,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	closedAt: row.closed_at,
});

const TERMINAL_PROPOSAL_STATUSES = new Set([
	'done',
	'retired',
	'superseded',
	'quarantined',
]);

const readByUidRow = (db: Database, uid: string): IStoredProposalRow | null =>
	db
		.query<IStoredProposalRow, [string]>(
			`SELECT id, uid, slug, kind, status, title, source_path,
					source_blob_sha, revision, content_hash, created_at,
					updated_at, closed_at
			 FROM proposals
			 WHERE uid = ?`,
		)
		.get(uid);

/**
 * x00539 S1 — the write boundary normalises through `vocabulary.ts`
 * instead of handing the raw frontmatter token to a CHECK-constrained
 * column. A value outside the vocabulary raises
 * `VocabularyViolationError`, which names the column and the offending
 * value; the reconciler turns that into a quarantine row for that ONE
 * entity. It used to surface as `CHECK constraint failed` and take the
 * whole run down with it.
 */
const requirePersistableCandidate = (candidate: IProposalCandidate) => {
	const kind = normalizeProposalKind(candidate.kind);
	if (kind === null) {
		throw new VocabularyViolationError(
			'kind',
			candidate.kind,
			candidate.uid,
		);
	}
	const status = normalizeLifecycleStatus(candidate.status);
	if (status === null) {
		throw new VocabularyViolationError(
			'status',
			candidate.status,
			candidate.uid,
		);
	}
	if (candidate.title.trim() === '') {
		throw new Error(`proposal candidate ${candidate.uid} is missing title`);
	}
	return { kind, status, title: candidate.title };
};

export class ProposalRepo {
	constructor(private readonly db: Database) {}

	getByUid(uid: string): IProposalRecord | null {
		const row = readByUidRow(this.db, uid);
		return row ? mapRow(row) : null;
	}

	upsertProjection(
		candidate: IProposalCandidate,
		now = Date.now(),
	): IUpsertProposalProjectionOutcome {
		const required = requirePersistableCandidate(candidate);
		const existing = this.getByUid(candidate.uid);
		if (existing === null) {
			let outcome: IUpsertProposalProjectionOutcome | null = null;
			const tx = this.db.transaction(() => {
				this.db
					.prepare(
						`INSERT INTO proposals (
							uid, slug, kind, status, title, source_path,
							source_blob_sha, revision, content_hash,
							created_at, updated_at, closed_at
						) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?)`,
					)
					.run(
						candidate.uid,
						candidate.slug,
						required.kind,
						required.status,
						required.title,
						candidate.path,
						candidate.bodyHash,
						now,
						now,
						required.status === 'done' ? now : null,
					);
				const created = this.getByUid(candidate.uid);
				if (!created) {
					throw new Error('proposal insert did not persist');
				}
				const outbox = new OutboxRepo(this.db).enqueue({
					idempotencyKey: `regenerate-index:proposal:${candidate.uid}:${String(created.revision)}`,
					kind: 'regenerate-index',
					payload: JSON.stringify({
						uid: candidate.uid,
						entityType: 'proposal',
						action: 'create',
						revision: created.revision,
					}),
					nextAttemptAt: now,
					now,
				});
				outcome = {
					kind: 'created',
					proposal: created,
					outbox: outbox.record,
				};
			});
			tx.immediate();
			if (outcome === null) {
				throw new Error('proposal insert produced no outcome');
			}
			return outcome;
		}

		const unchanged =
			existing.slug === candidate.slug &&
			existing.kind === required.kind &&
			existing.status === required.status &&
			existing.title === required.title &&
			existing.sourcePath === candidate.path &&
			existing.contentHash === candidate.bodyHash;
		if (unchanged) return { kind: 'unchanged', proposal: existing };

		let outcome: IUpsertProposalProjectionOutcome | null = null;
		const tx = this.db.transaction(() => {
			this.db
				.prepare(
					`UPDATE proposals
					 SET slug = ?, kind = ?, status = ?, title = ?,
						 source_path = ?, content_hash = ?,
						 revision = revision + 1,
						 updated_at = ?, closed_at = ?
					 WHERE uid = ?`,
				)
				.run(
					candidate.slug,
					required.kind,
					required.status,
					required.title,
					candidate.path,
					candidate.bodyHash,
					now,
					required.status === 'done'
						? (existing.closedAt ?? now)
						: null,
					candidate.uid,
				);
			const updated = this.getByUid(candidate.uid);
			if (!updated) {
				throw new Error(
					`proposal ${candidate.uid} disappeared after update`,
				);
			}
			const outbox = new OutboxRepo(this.db).enqueue({
				idempotencyKey: `regenerate-index:proposal:${candidate.uid}:${String(updated.revision)}`,
				kind: 'regenerate-index',
				payload: JSON.stringify({
					uid: candidate.uid,
					entityType: 'proposal',
					action: 'update',
					revision: updated.revision,
				}),
				nextAttemptAt: now,
				now,
			});
			outcome = {
				kind: 'updated',
				proposal: updated,
				outbox: outbox.record,
			};
		});
		tx.immediate();
		if (outcome === null) {
			throw new Error('proposal update produced no outcome');
		}
		return outcome;
	}

	closeProposal(args: ICloseProposalArgs): TCloseProposalOutcome {
		const now = args.now ?? Date.now();
		let outcome: TCloseProposalOutcome | null = null;
		const tx = this.db.transaction(() => {
			const current = this.getByUid(args.uid);
			if (current === null) {
				outcome = {
					kind: 'invalid_transition',
					reason: `proposal ${args.uid} not found`,
				};
				return;
			}
			const mutationCommands = new MutationCommandsRepo(this.db);
			const commandIdentity = resolveMutationCommandIdentity({
				commandName: 'close-proposal',
				entityType: 'proposal',
				entityUid: args.uid,
				targetStatus: 'done',
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
						commandName: 'close-proposal',
						...commandIdentity,
						entityType: 'proposal',
						entityUid: args.uid,
						revisionBefore: current.revision,
						actor: args.actor,
						source: args.source,
						now,
					})
				: null;
			const gate = receiptGate<TCloseProposalOutcome>({
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
			// Every exit from here records the receipt and returns the
			// same outcome. Written out at each guard it was twelve
			// identical lines, three times over — which is how a fix to
			// one copy stops reaching the others.
			const settle = (
				next: TCloseProposalOutcome,
				revisionAfter: number,
			) => {
				completeReceipt({
					claim: command,
					outcome: next,
					revisionAfter,
					now,
					complete: (call) => mutationCommands.complete(call),
				});
				return next;
			};
			if (current.status === 'done') {
				outcome = settle(
					{ kind: 'already_closed', proposal: current },
					current.revision,
				);
				return;
			}
			if (TERMINAL_PROPOSAL_STATUSES.has(current.status)) {
				outcome = settle(
					{
						kind: 'invalid_transition',
						reason: `cannot close proposal ${args.uid} from status ${current.status}`,
					},
					current.revision,
				);
				return;
			}
			if (
				args.expectedRevision !== undefined &&
				current.revision !== args.expectedRevision
			) {
				outcome = settle(
					{
						kind: 'conflict',
						proposal: current,
						currentRevision: current.revision,
					},
					current.revision,
				);
				return;
			}

			const nextRevision = current.revision + 1;
			this.db
				.prepare(
					`UPDATE proposals
					 SET status = 'done',
						 revision = ?,
						 updated_at = ?,
						 closed_at = ?
					 WHERE id = ?`,
				)
				.run(nextRevision, now, now, current.id);

			const lifecycleRepo = new LifecycleRepo(this.db);
			lifecycleRepo.append({
				entityType: 'proposal',
				entityUid: current.uid,
				entityRevision: nextRevision,
				fromStatus: current.status,
				toStatus: 'done',
				actor: args.actor,
				source: args.source,
				occurredAt: now,
				metadata: JSON.stringify({ action: 'close' }),
			});

			const outboxRepo = new OutboxRepo(this.db);
			const outbox = outboxRepo.enqueue({
				idempotencyKey: `regenerate-index:proposal:${current.uid}:${String(nextRevision)}`,
				kind: 'regenerate-index',
				payload: JSON.stringify({
					uid: current.uid,
					entityType: 'proposal',
					action: 'close',
					fromStatus: current.status,
					toStatus: 'done',
					revision: nextRevision,
				}),
				nextAttemptAt: now,
				now,
			});

			const updated = this.getByUid(args.uid);
			if (!updated) {
				throw new Error(`proposal ${args.uid} disappeared after close`);
			}
			outcome = settle(
				{
					kind: 'closed',
					proposal: updated,
					outbox: outbox.record,
				},
				updated.revision,
			);
		});
		tx.immediate();
		if (outcome === null) {
			throw new Error('closeProposal produced no outcome');
		}
		return outcome;
	}
}
