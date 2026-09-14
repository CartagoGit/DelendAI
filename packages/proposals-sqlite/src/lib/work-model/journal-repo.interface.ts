/**
 * Contract shapes for `./journal-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `journal-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `journal-repo.ts`, so no import site changes.
 */

export type ICoordinationEventKind =
	| 'owner-changed'
	| 'slice-recovered'
	| 'slice-deprecated'
	| 'semantic-checkpoint'
	| 'recovery-decision'
	| 'migration-applied'
	| 'reconciliation-outcome';

export interface ICoordinationEventRecord {
	readonly id: number;
	readonly eventId: string;
	readonly eventKind: ICoordinationEventKind;
	readonly repositoryUid: string | null;
	readonly workUnitUid: string | null;
	readonly proposalUid: string | null;
	readonly sliceUid: string | null;
	readonly generation: number | null;
	readonly actorAgentId: string | null;
	readonly machineId: string | null;
	readonly occurredAt: number;
	readonly recordedAt: number;
	readonly payload: unknown;
}

export interface IAppendCoordinationEventArgs {
	readonly eventKind: ICoordinationEventKind;
	readonly repositoryUid?: string | undefined;
	readonly workUnitUid?: string | undefined;
	readonly proposalUid?: string | undefined;
	readonly sliceUid?: string | undefined;
	readonly generation?: number | undefined;
	readonly actorAgentId?: string | undefined;
	readonly machineId?: string | undefined;
	readonly occurredAt: number;
	readonly payload?: Readonly<Record<string, unknown>> | undefined;
	readonly recordedAt?: number | undefined;
}

export interface IAppendCoordinationEventOutcome {
	/** False when this exact event was already in the journal. */
	readonly appended: boolean;
	readonly event: ICoordinationEventRecord;
}
