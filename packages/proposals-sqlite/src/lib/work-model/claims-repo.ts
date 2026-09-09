/**
 * claims-repo.ts — path ownership in a shared checkout.
 *
 * WHY the exclusion is a partial UNIQUE INDEX and not a query: in a
 * `shared-checkout` workspace two agents editing the same file is the
 * single failure the whole model exists to prevent, and a
 * "SELECT then INSERT" check can always be interleaved. Migration 0016
 * installs `idx_claims_active_path ON claims(repository_id, path)
 * WHERE released_at IS NULL`, so the SECOND claimant's INSERT is
 * rejected by SQLite itself. This repo translates that rejection into
 * a typed `conflict` outcome rather than letting a constraint error
 * escape — the caller is meant to back off, not to crash.
 *
 * WHY claims are released and never deleted: after the fact, "which
 * agent held this path when that checkpoint was written" must still be
 * answerable. Releasing sets `released_at`, which also frees the
 * partial index.
 */
import type { Database } from 'bun:sqlite';

export interface IClaimRecord {
	readonly id: number;
	readonly repositoryId: number;
	readonly path: string;
	readonly ownerAgentId: string;
	readonly leaseId: string;
	readonly workUnitId: number;
	readonly generation: number | null;
	readonly claimedAt: number;
	readonly releasedAt: number | null;
}

export interface IClaimPathsArgs {
	readonly repositoryId: number;
	readonly paths: readonly string[];
	readonly ownerAgentId: string;
	readonly leaseId: string;
	readonly workUnitId: number;
	readonly generation?: number | undefined;
	readonly now?: number | undefined;
}

export type TClaimOutcome =
	| { readonly kind: 'claimed'; readonly claims: readonly IClaimRecord[] }
	| {
			readonly kind: 'conflict';
			/** Paths already held by somebody else, sorted. */
			readonly conflicting: readonly string[];
	  };

interface IClaimRow {
	readonly id: number;
	readonly repository_id: number;
	readonly path: string;
	readonly owner_agent_id: string;
	readonly lease_id: string;
	readonly work_unit_id: number;
	readonly generation: number | null;
	readonly claimed_at: number;
	readonly released_at: number | null;
}

const CLAIM_COLUMNS = `id, repository_id, path, owner_agent_id, lease_id,
	work_unit_id, generation, claimed_at, released_at`;

const mapRow = (row: IClaimRow): IClaimRecord => ({
	id: row.id,
	repositoryId: row.repository_id,
	path: row.path,
	ownerAgentId: row.owner_agent_id,
	leaseId: row.lease_id,
	workUnitId: row.work_unit_id,
	generation: row.generation,
	claimedAt: row.claimed_at,
	releasedAt: row.released_at,
});

export class ClaimsRepo {
	constructor(private readonly db: Database) {}

	/**
	 * All-or-nothing: either every path is claimed by this owner, or
	 * nothing is written and the conflicting paths are reported. The
	 * transaction is IMMEDIATE so the write lock is held for the whole
	 * batch and a partial claim can never be observed.
	 */
	claim(args: IClaimPathsArgs): TClaimOutcome {
		const now = args.now ?? Date.now();
		const paths = [...new Set(args.paths)].sort();
		const conflicting: string[] = [];
		const tx = this.db.transaction(() => {
			for (const path of paths) {
				const changes = this.db
					.prepare(
						`INSERT INTO claims (
							repository_id, path, owner_agent_id, lease_id,
							work_unit_id, generation, claimed_at
						) VALUES (?, ?, ?, ?, ?, ?, ?)
						ON CONFLICT DO NOTHING`,
					)
					.run(
						args.repositoryId,
						path,
						args.ownerAgentId,
						args.leaseId,
						args.workUnitId,
						args.generation ?? null,
						now,
					).changes;
				if (changes !== 1) conflicting.push(path);
			}
			if (conflicting.length > 0) {
				// Abort the whole batch: a half-claimed scope is worse
				// than no claim at all, because the agent would believe it
				// owns files it does not.
				throw new PartialClaimRollback();
			}
		});
		try {
			tx.immediate();
		} catch (error) {
			if (error instanceof PartialClaimRollback) {
				return { kind: 'conflict', conflicting };
			}
			throw error;
		}
		return { kind: 'claimed', claims: this.activeForWorkUnit(args.workUnitId) };
	}

	/** Active claims held for a work unit, in path order. */
	activeForWorkUnit(workUnitId: number): readonly IClaimRecord[] {
		return this.db
			.query<IClaimRow, [number]>(
				`SELECT ${CLAIM_COLUMNS} FROM claims
				 WHERE work_unit_id = ? AND released_at IS NULL
				 ORDER BY path ASC`,
			)
			.all(workUnitId)
			.map(mapRow);
	}

	/** The active holder of one path, if any. */
	holderOf(repositoryId: number, path: string): IClaimRecord | null {
		const row = this.db
			.query<IClaimRow, [number, string]>(
				`SELECT ${CLAIM_COLUMNS} FROM claims
				 WHERE repository_id = ? AND path = ? AND released_at IS NULL`,
			)
			.get(repositoryId, path);
		return row ? mapRow(row) : null;
	}

	/** Releases every active claim of a work unit. Returns the count. */
	releaseForWorkUnit(workUnitId: number, now: number): number {
		return this.db
			.prepare(
				`UPDATE claims SET released_at = ?
				 WHERE work_unit_id = ? AND released_at IS NULL`,
			)
			.run(now, workUnitId).changes;
	}

	/**
	 * Releases claims whose lease is dead. This is the recovery path: a
	 * crashed agent's paths become claimable again only once its lease
	 * has actually expired, never on age alone.
	 */
	releaseClaimsOfExpiredLeases(now: number): number {
		return this.db
			.prepare(
				`UPDATE claims SET released_at = ?
				 WHERE released_at IS NULL AND lease_id IN (
					SELECT id FROM leases
					WHERE released_at IS NOT NULL OR expires_at <= ?
				 )`,
			)
			.run(now, now).changes;
	}
}

/** Internal control-flow marker used to roll a partial claim back. */
class PartialClaimRollback extends Error {
	constructor() {
		super('partial claim rolled back');
		this.name = 'PartialClaimRollback';
	}
}
