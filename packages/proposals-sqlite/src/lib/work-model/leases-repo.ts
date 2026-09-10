/**
 * leases-repo.ts — the `sqlite-leases` coordination strategy.
 *
 * WHY leases are data and not a background process: a lease must stay
 * correct across a laptop that slept for two days, a killed process,
 * and a database that was deleted and rebuilt. So liveness is defined
 * purely as `released_at IS NULL AND expires_at > now`, evaluated at
 * read time against a caller-supplied clock. Nothing sweeps; nothing
 * has to have been running for the answer to be right.
 *
 * WHY a lease is never deleted: `released_at` is set instead. The row
 * remains as the evidence that some agent, on some machine, in some
 * process, held write authority over a window of time — which is the
 * only way to explain after the fact why a checkpoint has the author
 * it has.
 *
 * `expire()` is a CAS on the same condition the reader uses, so an
 * expired lease cannot be "expired twice" into two different owners.
 */
import type { Database } from 'bun:sqlite';

export type ILeaseExpireOutcome =
	| { readonly kind: 'expired'; readonly lease: ILeaseRecord }
	| { readonly kind: 'not_expirable'; readonly lease: ILeaseRecord }
	| { readonly kind: 'unknown_lease' };

export interface ILeaseRecord {
	readonly id: string;
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly processId: number | null;
	readonly sessionId: string | null;
	readonly acquiredAt: number;
	readonly heartbeatAt: number;
	readonly expiresAt: number;
	readonly releasedAt: number | null;
}

export interface IAcquireLeaseArgs {
	readonly id: string;
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly processId?: number | undefined;
	readonly sessionId?: string | undefined;
	readonly acquiredAt: number;
	readonly ttlMs: number;
}

interface ILeaseRow {
	readonly id: string;
	readonly owner_agent_id: string;
	readonly machine_id: string;
	readonly process_id: number | null;
	readonly session_id: string | null;
	readonly acquired_at: number;
	readonly heartbeat_at: number;
	readonly expires_at: number;
	readonly released_at: number | null;
}

const LEASE_COLUMNS = `id, owner_agent_id, machine_id, process_id, session_id,
	acquired_at, heartbeat_at, expires_at, released_at`;

const mapRow = (row: ILeaseRow): ILeaseRecord => ({
	id: row.id,
	ownerAgentId: row.owner_agent_id,
	machineId: row.machine_id,
	processId: row.process_id,
	sessionId: row.session_id,
	acquiredAt: row.acquired_at,
	heartbeatAt: row.heartbeat_at,
	expiresAt: row.expires_at,
	releasedAt: row.released_at,
});

/** A lease is live only while unreleased AND not yet past its expiry. */
export const isLeaseLive = (lease: ILeaseRecord, now: number): boolean =>
	lease.releasedAt === null && lease.expiresAt > now;

export class LeasesRepo {
	constructor(private readonly db: Database) {}

	/**
	 * Idempotent on the deterministic lease id (see `ids.ts`): taking
	 * the same lease twice extends the heartbeat instead of creating a
	 * second row.
	 */
	acquire(args: IAcquireLeaseArgs): ILeaseRecord {
		if (args.ttlMs <= 0) {
			throw new Error('lease ttlMs must be greater than zero');
		}
		const expiresAt = args.acquiredAt + args.ttlMs;
		this.db
			.prepare(
				`INSERT INTO leases (
					id, owner_agent_id, machine_id, process_id, session_id,
					acquired_at, heartbeat_at, expires_at, released_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
				ON CONFLICT (id) DO UPDATE SET
					heartbeat_at = MAX(leases.heartbeat_at, excluded.heartbeat_at),
					expires_at = MAX(leases.expires_at, excluded.expires_at)`,
			)
			.run(
				args.id,
				args.ownerAgentId,
				args.machineId,
				args.processId ?? null,
				args.sessionId ?? null,
				args.acquiredAt,
				args.acquiredAt,
				expiresAt,
			);
		const row = this.get(args.id);
		if (!row) throw new Error('leases upsert did not persist');
		return row;
	}

	get(id: string): ILeaseRecord | null {
		const row = this.db
			.query<ILeaseRow, [string]>(
				`SELECT ${LEASE_COLUMNS} FROM leases WHERE id = ?`,
			)
			.get(id);
		return row ? mapRow(row) : null;
	}

	/**
	 * Moves the heartbeat and the expiry forward. Refuses to renew a
	 * lease that is already dead — reviving one would silently hand
	 * write authority back to a process nobody has heard from.
	 */
	heartbeat(id: string, now: number, ttlMs: number): ILeaseRecord | null {
		const changed = this.db
			.prepare(
				`UPDATE leases
				 SET heartbeat_at = ?, expires_at = ?
				 WHERE id = ? AND released_at IS NULL AND expires_at > ?`,
			)
			.run(now, now + ttlMs, id, now).changes;
		return changed === 1 ? this.get(id) : null;
	}

	/** Voluntary release by the owner. Idempotent. */
	release(id: string, now: number): ILeaseRecord | null {
		this.db
			.prepare(
				`UPDATE leases SET released_at = ?
				 WHERE id = ? AND released_at IS NULL`,
			)
			.run(now, id);
		return this.get(id);
	}

	/**
	 * Marks a lease dead because its expiry passed. The WHERE clause is
	 * the CAS: exactly one caller can move an expired lease to released,
	 * so two reconcilers racing to reap the same lease cannot both
	 * believe they were the reaper.
	 */
	expire(id: string, now: number): ILeaseExpireOutcome {
		const changed = this.db
			.prepare(
				`UPDATE leases SET released_at = ?
				 WHERE id = ? AND released_at IS NULL AND expires_at <= ?`,
			)
			.run(now, id, now).changes;
		const lease = this.get(id);
		if (!lease) return { kind: 'unknown_lease' };
		return changed === 1
			? { kind: 'expired', lease }
			: { kind: 'not_expirable', lease };
	}

	/** Every lease that is still live at `now`. */
	listLive(now: number): readonly ILeaseRecord[] {
		return this.db
			.query<ILeaseRow, [number]>(
				`SELECT ${LEASE_COLUMNS} FROM leases
				 WHERE released_at IS NULL AND expires_at > ?
				 ORDER BY expires_at ASC`,
			)
			.all(now)
			.map(mapRow);
	}

	/** Every lease whose window has passed but which nobody reaped. */
	listExpired(now: number): readonly ILeaseRecord[] {
		return this.db
			.query<ILeaseRow, [number]>(
				`SELECT ${LEASE_COLUMNS} FROM leases
				 WHERE released_at IS NULL AND expires_at <= ?
				 ORDER BY expires_at ASC`,
			)
			.all(now)
			.map(mapRow);
	}
}
