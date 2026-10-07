/**
 * Contract shapes for `./registry-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `registry-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `registry-repo.ts`, so no import site changes.
 */

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
