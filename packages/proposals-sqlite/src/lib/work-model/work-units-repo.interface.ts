/**
 * Contract shapes for `./work-units-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `work-units-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `work-units-repo.ts`, so no import site changes.
 */

import { workUnitUid, type IRepositoryKey } from './ids';

export type IWorkUnitState =
	| 'pending'
	| 'claimed'
	| 'in-progress'
	| 'recoverable'
	| 'integrating'
	| 'integrated'
	| 'deprecated';

export type IOwnershipReason =
	| 'created'
	| 'claimed'
	| 'recovered'
	| 'handoff'
	| 'released'
	| 'expired';

export interface IWorkUnitRecord {
	readonly id: number;
	readonly uid: string;
	readonly repositoryId: number;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly state: IWorkUnitState;
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
	readonly reason: IOwnershipReason;
	readonly acquiredAt: number;
	readonly releasedAt: number | null;
}

export interface IEnsureWorkUnitArgs {
	readonly repositoryId: number;
	readonly repository: IRepositoryKey;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly createdByAgentId: string;
	readonly state?: IWorkUnitState | undefined;
	readonly now?: number | undefined;
}

export interface IChangeOwnerArgs {
	readonly uid: string;
	readonly agentId: string;
	readonly reason: IOwnershipReason;
	readonly now?: number | undefined;
}

export type ICloseWorkUnitOutcome =
	| { readonly kind: 'closed'; readonly workUnit: IWorkUnitRecord }
	| { readonly kind: 'already_closed'; readonly workUnit: IWorkUnitRecord }
	| { readonly kind: 'unknown_work_unit'; readonly uid: string };

export interface ICloseWorkUnitArgs {
	readonly uid: string;
	readonly terminalState?: Extract<
		IWorkUnitState,
		'integrated' | 'deprecated'
	>;
	readonly now?: number | undefined;
}
