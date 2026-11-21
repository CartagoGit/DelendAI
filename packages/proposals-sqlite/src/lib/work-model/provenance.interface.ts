/**
 * Contract shapes for `./provenance`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `provenance.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `provenance.ts`, so no import site changes.
 */

import type { ICiRunRecord } from './forge-repo';
import type { ICoordinationEventRecord } from './journal-repo';
import type {
	ICandidateState,
	ICheckpointKind,
	ICiResult,
	IValidationState,
} from './generations-repo';

export interface IGenerationProvenance {
	readonly repository: {
		readonly uid: string;
		readonly integrationBranch: string;
	};
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly workUnitUid: string;
	readonly generation: number;
	readonly checkpointKind: ICheckpointKind;
	readonly candidateState: ICandidateState;
	readonly validationState: IValidationState;
	readonly ciResult: ICiResult | null;
	readonly agent: {
		readonly id: string;
		readonly host: string;
		readonly model: string | null;
	};
	readonly machine: { readonly id: string; readonly hostname: string };
	readonly createdByAgentId: string;
	readonly currentOwnerAgentId: string | null;
	readonly fileScope: readonly string[];
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly pullRequest: {
		readonly number: number;
		readonly headRef: string;
		readonly baseRef: string;
		readonly state: string;
		readonly mergeSha: string | null;
	} | null;
	readonly integratedSha: string | null;
	readonly ciRuns: readonly ICiRunRecord[];
	readonly journal: readonly ICoordinationEventRecord[];
}
