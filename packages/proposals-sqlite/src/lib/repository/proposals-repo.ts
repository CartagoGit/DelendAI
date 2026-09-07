import type { Database } from 'bun:sqlite';

import type { IProposalCandidate } from '../reconciler';
import { LifecycleRepo } from './lifecycle-repo';
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
	| { readonly kind: 'created'; readonly proposal: IProposalRecord }
	| { readonly kind: 'updated'; readonly proposal: IProposalRecord }
	| { readonly kind: 'unchanged'; readonly proposal: IProposalRecord };

export interface ICloseProposalArgs {
	readonly uid: string;
	readonly actor: string;
	readonly source: string;
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

const readByUidRow = (
	db: Database,
	uid: string,
): IStoredProposalRow | null =>
	db
		.query<IStoredProposalRow, [string]>(
			`SELECT id, uid, slug, kind, status, title, source_path,
					source_blob_sha, revision, content_hash, created_at,
					updated_at, closed_at
			 FROM proposals
			 WHERE uid = ?`,
		)
		.get(uid);

const requirePersistableCandidate = (candidate: IProposalCandidate) => {
	if (candidate.kind === null || candidate.status === null) {
		throw new Error(
			`proposal candidate ${candidate.uid} is missing kind or status`,
		);
	}
	if (candidate.title.trim() === '') {
		throw new Error(`proposal candidate ${candidate.uid} is missing title`);
	}
	return {
		kind: candidate.kind,
		status: candidate.status,
		title: candidate.title,
	};
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
			return { kind: 'created', proposal: created };
		}

		const unchanged =
			existing.slug === candidate.slug &&
			existing.kind === required.kind &&
			existing.status === required.status &&
			existing.title === required.title &&
			existing.sourcePath === candidate.path &&
			existing.contentHash === candidate.bodyHash;
		if (unchanged) return { kind: 'unchanged', proposal: existing };

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
				required.status === 'done' ? (existing.closedAt ?? now) : null,
				candidate.uid,
			);
		const updated = this.getByUid(candidate.uid);
		if (!updated) {
			throw new Error(`proposal ${candidate.uid} disappeared after update`);
		}
		return { kind: 'updated', proposal: updated };
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
			if (current.status === 'done') {
				outcome = { kind: 'already_closed', proposal: current };
				return;
			}
			if (TERMINAL_PROPOSAL_STATUSES.has(current.status)) {
				outcome = {
					kind: 'invalid_transition',
					reason: `cannot close proposal ${args.uid} from status ${current.status}`,
				};
				return;
			}
			if (
				args.expectedRevision !== undefined &&
				current.revision !== args.expectedRevision
			) {
				outcome = {
					kind: 'conflict',
					proposal: current,
					currentRevision: current.revision,
				};
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
				idempotencyKey: `proposal-close:${current.uid}:${String(nextRevision)}`,
				kind: 'proposal-closed',
				payload: JSON.stringify({
					uid: current.uid,
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
			outcome = {
				kind: 'closed',
				proposal: updated,
				outbox: outbox.record,
			};
		});
		tx.immediate();
		if (outcome === null) {
			throw new Error('closeProposal produced no outcome');
		}
		return outcome;
	}
}