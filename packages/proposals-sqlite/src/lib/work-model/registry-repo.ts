/**
 * registry-repo.ts — repositories, machines and agents.
 *
 * WHY these three live together: they are the identity substrate every
 * other work-model table points at, and all three share one rule —
 * they are UPSERTS keyed on a natural key, never inserts keyed on an
 * autoincrement. A machine that rebuilds its database from the forge
 * re-registers itself and the agents it knows about; doing so twice
 * must converge on the same rows, so `register*` is idempotent by
 * construction and only ever moves `last_seen` forward.
 *
 * `first_seen` is deliberately never overwritten: it is the earliest
 * observation THIS database has, and a rebuild that starts later is
 * allowed to have a later `first_seen` without that being an anomaly.
 */
import type { Database } from 'bun:sqlite';

import type { IRepositoryKey } from './ids';

export type IAgentState = 'idle' | 'working' | 'blocked' | 'offline';

export interface IRepositoryRecord {
	readonly id: number;
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
	readonly integrationBranch: string;
	readonly releaseBranch: string;
}

export interface IRegisterRepositoryArgs extends IRepositoryKey {
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	readonly now?: number | undefined;
}

export interface IMachineRecord {
	readonly machineId: string;
	readonly hostname: string;
	readonly platform: string | null;
	readonly firstSeen: number;
	readonly lastSeen: number;
}

export interface IRegisterMachineArgs {
	readonly machineId: string;
	readonly hostname: string;
	readonly platform?: string | undefined;
	readonly now?: number | undefined;
}

export interface IAgentRecord {
	readonly id: string;
	readonly host: string;
	readonly model: string | null;
	readonly machineId: string;
	readonly state: IAgentState;
	readonly firstSeen: number;
	readonly lastSeen: number;
}

export interface IRegisterAgentArgs {
	readonly id: string;
	readonly host: string;
	readonly model?: string | undefined;
	readonly machineId: string;
	readonly state?: IAgentState | undefined;
	readonly now?: number | undefined;
}

interface IRepositoryRow {
	readonly id: number;
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
	readonly integration_branch: string;
	readonly release_branch: string;
}

interface IMachineRow {
	readonly machine_id: string;
	readonly hostname: string;
	readonly platform: string | null;
	readonly first_seen: number;
	readonly last_seen: number;
}

interface IAgentRow {
	readonly id: string;
	readonly host: string;
	readonly model: string | null;
	readonly machine_id: string;
	readonly state: IAgentState;
	readonly first_seen: number;
	readonly last_seen: number;
}

const mapRepository = (row: IRepositoryRow): IRepositoryRecord => ({
	id: row.id,
	forge: row.forge,
	owner: row.owner,
	name: row.name,
	integrationBranch: row.integration_branch,
	releaseBranch: row.release_branch,
});

const mapMachine = (row: IMachineRow): IMachineRecord => ({
	machineId: row.machine_id,
	hostname: row.hostname,
	platform: row.platform,
	firstSeen: row.first_seen,
	lastSeen: row.last_seen,
});

const mapAgent = (row: IAgentRow): IAgentRecord => ({
	id: row.id,
	host: row.host,
	model: row.model,
	machineId: row.machine_id,
	state: row.state,
	firstSeen: row.first_seen,
	lastSeen: row.last_seen,
});

const REPOSITORY_COLUMNS = `id, forge, owner, name, integration_branch, release_branch`;

export class WorkRegistryRepo {
	constructor(private readonly db: Database) {}

	/** Idempotent on `(forge, owner, name)`. */
	registerRepository(args: IRegisterRepositoryArgs): IRepositoryRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`INSERT INTO repositories (
					forge, owner, name, integration_branch, release_branch,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (forge, owner, name) DO UPDATE SET
					integration_branch = excluded.integration_branch,
					release_branch = excluded.release_branch,
					updated_at = excluded.updated_at`,
			)
			.run(
				args.forge,
				args.owner,
				args.name,
				args.integrationBranch,
				args.releaseBranch,
				now,
				now,
			);
		const row = this.findRepository(args);
		if (!row) throw new Error('repositories upsert did not persist');
		return row;
	}

	findRepository(key: IRepositoryKey): IRepositoryRecord | null {
		const row = this.db
			.query<IRepositoryRow, [string, string, string]>(
				`SELECT ${REPOSITORY_COLUMNS} FROM repositories
				 WHERE forge = ? AND owner = ? AND name = ?`,
			)
			.get(key.forge, key.owner, key.name);
		return row ? mapRepository(row) : null;
	}

	/** Idempotent on `machine_id`; `first_seen` is never moved back. */
	registerMachine(args: IRegisterMachineArgs): IMachineRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`INSERT INTO machines (
					machine_id, hostname, platform, first_seen, last_seen
				) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (machine_id) DO UPDATE SET
					hostname = excluded.hostname,
					platform = excluded.platform,
					first_seen = MIN(machines.first_seen, excluded.first_seen),
					last_seen = MAX(machines.last_seen, excluded.last_seen)`,
			)
			.run(
				args.machineId,
				args.hostname,
				args.platform ?? null,
				now,
				now,
			);
		const row = this.findMachine(args.machineId);
		if (!row) throw new Error('machines upsert did not persist');
		return row;
	}

	findMachine(machineId: string): IMachineRecord | null {
		const row = this.db
			.query<IMachineRow, [string]>(
				`SELECT machine_id, hostname, platform, first_seen, last_seen
				 FROM machines WHERE machine_id = ?`,
			)
			.get(machineId);
		return row ? mapMachine(row) : null;
	}

	/** Idempotent on the agent id. */
	registerAgent(args: IRegisterAgentArgs): IAgentRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`INSERT INTO agents (
					id, host, model, machine_id, state, first_seen, last_seen
				) VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET
					host = excluded.host,
					model = excluded.model,
					machine_id = excluded.machine_id,
					state = excluded.state,
					first_seen = MIN(agents.first_seen, excluded.first_seen),
					last_seen = MAX(agents.last_seen, excluded.last_seen)`,
			)
			.run(
				args.id,
				args.host,
				args.model ?? null,
				args.machineId,
				args.state ?? 'idle',
				now,
				now,
			);
		const row = this.findAgent(args.id);
		if (!row) throw new Error('agents upsert did not persist');
		return row;
	}

	findAgent(agentId: string): IAgentRecord | null {
		const row = this.db
			.query<IAgentRow, [string]>(
				`SELECT id, host, model, machine_id, state, first_seen, last_seen
				 FROM agents WHERE id = ?`,
			)
			.get(agentId);
		return row ? mapAgent(row) : null;
	}
}
