/**
 * Contract shapes for `./generations-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `generations-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `generations-repo.ts`, so no import site changes.
 */

export type ICheckpointKind = 'durability' | 'merge-candidate';

export type ICandidateState =
	| 'draft'
	| 'proposed'
	| 'integrating'
	| 'integrated'
	| 'superseded'
	| 'abandoned';

export type IValidationState =
	| 'unknown'
	| 'pending'
	| 'green'
	| 'red'
	| 'skipped';

export type ICiResult =
	| 'pending'
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'timed_out'
	| 'neutral';

export interface IGenerationRecord {
	readonly id: number;
	readonly workUnitId: number;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	readonly fileScopeDigest: string;
	readonly checkpointKind: ICheckpointKind;
	readonly candidateState: ICandidateState;
	readonly validationState: IValidationState;
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly pullRequestId: number | null;
	readonly ciResult: ICiResult | null;
	readonly integratedSha: string | null;
	readonly revision: number;
}

export interface IRecordGenerationArgs {
	readonly workUnitId: number;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	readonly checkpointKind: ICheckpointKind;
	readonly candidateState?: ICandidateState | undefined;
	readonly validationState?: IValidationState | undefined;
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly now?: number | undefined;
}
