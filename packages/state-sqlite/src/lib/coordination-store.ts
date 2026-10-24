/**
 * coordination-store.ts — a scope's coordination state, durable.
 *
 * Generations were stored; what coordinates them was not. Fencing
 * tokens, lease serials and generation ids restarted at one in every
 * new process, holders vanished and so did swarm claims: a lease taken
 * before a restart named a token the next process handed out again.
 * Three tables keep it — the counters, the holders of each generation
 * (a project lease is a holder of its kind, not a second record of the
 * same fact) and the swarm claims in force.
 */
import type { Database } from 'bun:sqlite';

import { COORDINATION_TABLES } from './contracts/constants/coordination.constant';
import type {
	IScopeCoordination,
	IStoredHolder,
	IStoredSwarmClaim,
} from '@delendai/state';

interface ICountersRow {
	readonly global_serial: number;
	readonly next_generation_serial: number;
	readonly next_project_lease_token: number;
	readonly next_project_lease_serial: number;
	readonly next_swarm_lease_token: number;
}

interface IHolderRow {
	readonly generation_id: string;
	readonly holder_id: string;
	readonly kind: IStoredHolder['kind'];
	readonly acquired_at: number;
}

interface IClaimRow {
	readonly slot: string;
	readonly token: number;
	readonly holder_id: string;
	readonly generation_id: string;
}

/** The scope's stored coordination, or nothing when none was stored. */
export const readCoordination = (
	db: Database,
	scopeKind: string,
	locator: string,
): IScopeCoordination | undefined => {
	const counters = db
		.query(
			`SELECT global_serial, next_generation_serial, next_project_lease_token,
				next_project_lease_serial, next_swarm_lease_token
			 FROM state_fencing_tokens
			 WHERE scope_kind = ? AND scope_locator_json = ?`,
		)
		.get(scopeKind, locator) as ICountersRow | null;
	if (counters === null) return undefined;
	const holders = db
		.query(
			`SELECT generation_id, holder_id, kind, acquired_at
			 FROM state_holders
			 WHERE scope_kind = ? AND scope_locator_json = ?
			 ORDER BY generation_id, holder_id`,
		)
		.all(scopeKind, locator) as readonly IHolderRow[];
	const claims = db
		.query(
			`SELECT slot, token, holder_id, generation_id
			 FROM state_swarm_claims
			 WHERE scope_kind = ? AND scope_locator_json = ?
			 ORDER BY slot`,
		)
		.all(scopeKind, locator) as readonly IClaimRow[];
	return {
		globalSerial: counters.global_serial,
		nextGenerationSerial: counters.next_generation_serial,
		nextProjectLeaseToken: counters.next_project_lease_token,
		nextProjectLeaseSerial: counters.next_project_lease_serial,
		nextSwarmLeaseToken: counters.next_swarm_lease_token,
		holders: holders.map((row) => ({
			generationId: row.generation_id,
			id: row.holder_id,
			kind: row.kind,
			acquiredAt: row.acquired_at,
		})),
		swarmClaims: claims.map(
			(row): IStoredSwarmClaim => ({
				slot: row.slot,
				token: row.token as IStoredSwarmClaim['token'],
				holderId: row.holder_id,
				generationId: row.generation_id,
			}),
		),
	};
};

/**
 * Replace the scope's stored coordination with `coordination`. The
 * caller runs it inside the transaction that stores the generations, so
 * the two are never seen apart.
 */
export const writeCoordination = (
	db: Database,
	scopeKind: string,
	locator: string,
	coordination: IScopeCoordination,
	now: number,
): void => {
	for (const table of COORDINATION_TABLES) {
		db.query(
			`DELETE FROM ${table} WHERE scope_kind = ? AND scope_locator_json = ?`,
		).run(scopeKind, locator);
	}
	db.query(
		`INSERT INTO state_fencing_tokens (
			scope_kind, scope_locator_json, global_serial, next_generation_serial,
			next_project_lease_token, next_project_lease_serial,
			next_swarm_lease_token, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		scopeKind,
		locator,
		coordination.globalSerial,
		coordination.nextGenerationSerial,
		coordination.nextProjectLeaseToken,
		coordination.nextProjectLeaseSerial,
		coordination.nextSwarmLeaseToken,
		now,
	);
	for (const holder of coordination.holders) {
		db.query(
			`INSERT INTO state_holders (
				scope_kind, scope_locator_json, generation_id, holder_id, kind, acquired_at
			) VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			scopeKind,
			locator,
			holder.generationId,
			holder.id,
			holder.kind,
			holder.acquiredAt,
		);
	}
	for (const claim of coordination.swarmClaims) {
		db.query(
			`INSERT INTO state_swarm_claims (
				scope_kind, scope_locator_json, slot, token, holder_id, generation_id
			) VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			scopeKind,
			locator,
			claim.slot,
			claim.token,
			claim.holderId,
			claim.generationId,
		);
	}
};
