/**
 * work-units-repo.ts — one (repository, proposal, slice) run, and the
 * ownership history behind it.
 *
 * WHY the close/transition path looks the way it does. The known
 * failure mode in this codebase is a lifecycle close that reads the
 * current state, decides, then writes — where two concurrent callers
 * both read "open", both decide "I will close it", and the second
 * write either loses silently or aborts, producing ZERO winners. The
 * guarantee required here is stronger and exact:
 *
 *     N concurrent closes → EXACTLY ONE `closed`,
 *                           N-1 `already_closed`,
 *                           NEVER zero.
 *
 * So the decision is NOT taken in TypeScript from a prior read. It is
 * taken by a single conditional UPDATE whose WHERE clause carries the
 * precondition:
 *
 *     UPDATE work_units SET ... WHERE id = ? AND closed_at IS NULL
 *
 * SQLite evaluates that statement atomically, and `changes` is the
 * verdict: 1 means this caller performed the close, 0 means someone
 * else already had. Both branches then re-read to report the row. The
 * whole thing runs inside `BEGIN IMMEDIATE` (via `tx.immediate()`) so
 * the journal append and the owner release commit with the state
 * change or not at all, and the write lock is taken up front instead
 * of being upgraded mid-transaction (the classic SQLITE_BUSY
 * deadlock). No retry loop exists, and none is needed: a caller that
 * loses the race gets a truthful `already_closed`, not an error to
 * paper over.
 */
import type { Database } from 'bun:sqlite';

import { workUnitUid, type IRepositoryKey } from './ids';

export type TWorkUnitState =
	| 'pending'
	| 'claimed'
	| 'in-progress'
	| 'recoverable'
	| 'integrating'
	| 'integrated'
	| 'deprecated';

export type TOwnershipReason =
	| 'created'
	| 'claimed'
	| 'recovered'
	| 'handoff'
	| 'released'
	| 'expired';

const TERMINAL_STATES: ReadonlySet<TWorkUnitState> = new Set([
	'integrated',
	'deprecated',
]);

export interface IWorkUnitRecord {
	readonly id: number;
	readonly uid: string;
	readonly repositoryId: number;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly state: TWorkUnitState;
	readonly currentGeneration: number;
	readonly currentOwnerAgentId: string | null;
	readonly createdByAgentId: string;
	readonly revision: number;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly closedAt: number | null;
}

export interface IOwnershipRecord {
	readonly seq: number;
	readonly agentId: string;
	readonly reason: TOwnershipReason;
	readonly acquiredAt: number;
	readonly releasedAt: number | null;
}

export interface IEnsureWorkUnitArgs {
	readonly repositoryId: number;
	readonly repository: IRepositoryKey;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly createdByAgentId: string;
	readonly state?: TWorkUnitState | undefined;
	readonly now?: number | undefined;
}

export interface IChangeOwnerArgs {
	readonly uid: string;
	readonly agentId: string;
	readonly reason: TOwnershipReason;
	readonly now?: number | undefined;
}

export type TCloseWorkUnitOutcome =
	| { readonly kind: 'closed'; readonly workUnit: IWorkUnitRecord }
	| { readonly kind: 'already_closed'; readonly workUnit: IWorkUnitRecord }
	| { readonly kind: 'unknown_work_unit'; readonly uid: string };

export interface ICloseWorkUnitArgs {
	readonly uid: string;
	readonly terminalState?: Extract<
		TWorkUnitState,
		'integrated' | 'deprecated'
	>;
	readonly now?: number | undefined;
}

interface IWorkUnitRow {
	readonly id: number;
	readonly uid: string;
	readonly repository_id: number;
	readonly proposal_uid: string;
	readonly slice_uid: string;
	readonly state: TWorkUnitState;
	readonly current_generation: number;
	readonly current_owner_agent_id: string | null;
	readonly created_by_agent_id: string;
	readonly revision: number;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
}

interface IOwnerRow {
	readonly seq: number;
	readonly agent_id: string;
	readonly reason: TOwnershipReason;
	readonly acquired_at: number;
	readonly released_at: number | null;
}

const WORK_UNIT_COLUMNS = `id, uid, repository_id, proposal_uid, slice_uid,
	state, current_generation, current_owner_agent_id, created_by_agent_id,
	revision, created_at, updated_at, closed_at`;

const mapRow = (row: IWorkUnitRow): IWorkUnitRecord => ({
	id: row.id,
	uid: row.uid,
	repositoryId: row.repository_id,
	proposalUid: row.proposal_uid,
	sliceUid: row.slice_uid,
	state: row.state,
	currentGeneration: row.current_generation,
	currentOwnerAgentId: row.current_owner_agent_id,
	createdByAgentId: row.created_by_agent_id,
	revision: row.revision,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	closedAt: row.closed_at,
});

export class WorkUnitsRepo {
	constructor(private readonly db: Database) {}

	getByUid(uid: string): IWorkUnitRecord | null {
		const row = this.db
			.query<IWorkUnitRow, [string]>(
				`SELECT ${WORK_UNIT_COLUMNS} FROM work_units WHERE uid = ?`,
			)
			.get(uid);
		return row ? mapRow(row) : null;
	}

	/**
	 * Idempotent create. The uid is derived (never generated), so a
	 * rebuild that rediscovers the same slice from a `wip/*` ref lands
	 * on the existing row. Nothing about an existing unit is mutated —
	 * a rebuild must not silently reassign ownership.
	 */
	ensure(args: IEnsureWorkUnitArgs): IWorkUnitRecord {
		const now = args.now ?? Date.now();
		const uid = workUnitUid({
			repository: args.repository,
			proposalUid: args.proposalUid,
			sliceUid: args.sliceUid,
		});
		const existing = this.getByUid(uid);
		if (existing) return existing;

		const state = args.state ?? 'pending';
		const tx = this.db.transaction(() => {
			this.db
				.prepare(
					`INSERT INTO work_units (
						uid, repository_id, proposal_uid, slice_uid, state,
						current_generation, current_owner_agent_id,
						created_by_agent_id, revision, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)
					ON CONFLICT (uid) DO NOTHING`,
				)
				.run(
					uid,
					args.repositoryId,
					args.proposalUid,
					args.sliceUid,
					state,
					args.createdByAgentId,
					args.createdByAgentId,
					now,
					now,
				);
			// `seq = 0` is by definition the creator, so `created_by`
			// survives even if the work unit row is later repaired.
			this.db
				.prepare(
					`INSERT INTO work_unit_owners (
						work_unit_id, seq, agent_id, reason, acquired_at
					)
					SELECT id, 0, ?, 'created', ? FROM work_units WHERE uid = ?
					ON CONFLICT (work_unit_id, seq) DO NOTHING`,
				)
				.run(args.createdByAgentId, now, uid);
		});
		tx.immediate();
		const created = this.getByUid(uid);
		if (!created) throw new Error(`work unit ${uid} did not persist`);
		return created;
	}

	/** Full ownership history, oldest first. `seq = 0` is the creator. */
	ownershipHistory(uid: string): readonly IOwnershipRecord[] {
		return this.db
			.query<IOwnerRow, [string]>(
				`SELECT o.seq, o.agent_id, o.reason, o.acquired_at, o.released_at
				 FROM work_unit_owners o
				 JOIN work_units w ON w.id = o.work_unit_id
				 WHERE w.uid = ?
				 ORDER BY o.seq ASC`,
			)
			.all(uid)
			.map((row) => ({
				seq: row.seq,
				agentId: row.agent_id,
				reason: row.reason,
				acquiredAt: row.acquired_at,
				releasedAt: row.released_at,
			}));
	}

	/** Every owner before the current one, oldest first. */
	previousOwners(uid: string): readonly string[] {
		const history = this.ownershipHistory(uid);
		return history
			.slice(0, Math.max(history.length - 1, 0))
			.map((entry) => entry.agentId);
	}

	/**
	 * Hands the unit to a new owner, closing the previous ownership
	 * window. Runs under BEGIN IMMEDIATE so the `seq` allocation and the
	 * `current_owner` write cannot interleave with another handoff.
	 */
	changeOwner(args: IChangeOwnerArgs): IWorkUnitRecord {
		const now = args.now ?? Date.now();
		const tx = this.db.transaction(() => {
			const unit = this.getByUid(args.uid);
			if (!unit) throw new Error(`work unit ${args.uid} not found`);
			this.db
				.prepare(
					`UPDATE work_unit_owners SET released_at = ?
					 WHERE work_unit_id = ? AND released_at IS NULL`,
				)
				.run(now, unit.id);
			this.db
				.prepare(
					`INSERT INTO work_unit_owners (
						work_unit_id, seq, agent_id, reason, acquired_at
					)
					VALUES (
						?,
						(SELECT COALESCE(MAX(seq), -1) + 1
						 FROM work_unit_owners WHERE work_unit_id = ?),
						?, ?, ?
					)`,
				)
				.run(unit.id, unit.id, args.agentId, args.reason, now);
			this.db
				.prepare(
					`UPDATE work_units
					 SET current_owner_agent_id = ?, revision = revision + 1,
						 updated_at = ?
					 WHERE id = ?`,
				)
				.run(args.agentId, now, unit.id);
		});
		tx.immediate();
		const updated = this.getByUid(args.uid);
		if (!updated) throw new Error(`work unit ${args.uid} disappeared`);
		return updated;
	}

	/** Advances the head generation pointer monotonically. */
	advanceGeneration(uid: string, generation: number, now: number): void {
		this.db
			.prepare(
				`UPDATE work_units
				 SET current_generation = MAX(current_generation, ?),
					 updated_at = ?
				 WHERE uid = ?`,
			)
			.run(generation, now, uid);
	}

	/**
	 * The single-winner close. See the file header: the verdict comes
	 * from `changes` on a conditional UPDATE, never from a prior read,
	 * so N racing callers produce exactly one `closed`.
	 */
	close(args: ICloseWorkUnitArgs): TCloseWorkUnitOutcome {
		const now = args.now ?? Date.now();
		const terminalState = args.terminalState ?? 'integrated';
		if (!TERMINAL_STATES.has(terminalState)) {
			throw new Error(`${terminalState} is not a terminal work state`);
		}
		let won = false;
		const tx = this.db.transaction(() => {
			won =
				this.db
					.prepare(
						`UPDATE work_units
						 SET state = ?, closed_at = ?, updated_at = ?,
							 revision = revision + 1
						 WHERE uid = ? AND closed_at IS NULL`,
					)
					.run(terminalState, now, now, args.uid).changes === 1;
			if (won) {
				this.db
					.prepare(
						`UPDATE work_unit_owners SET released_at = ?
						 WHERE released_at IS NULL AND work_unit_id =
							(SELECT id FROM work_units WHERE uid = ?)`,
					)
					.run(now, args.uid);
			}
		});
		tx.immediate();

		const workUnit = this.getByUid(args.uid);
		if (!workUnit) return { kind: 'unknown_work_unit', uid: args.uid };
		return won
			? { kind: 'closed', workUnit }
			: { kind: 'already_closed', workUnit };
	}
}
