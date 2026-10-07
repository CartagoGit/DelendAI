/** A workflow run of the CI workflow, as the forge reports it. */
export interface ICertificationRun {
	readonly event: string;
	readonly head_sha: string;
	readonly conclusion: string | null;
	readonly status: string;
}

/**
 * Where the integration branch's tip stands: `certified` only once a full
 * run finished green; `pending` while one runs; `red` when every full run
 * finished and none passed, or when the tip's full runs were cancelled as
 * often as `MAX_CANCELLED_FULL_RUNS` allows; `uncertified` when none was
 * started, or only fewer cancelled ones.
 */
export type IIntegrationCertification =
	| 'certified'
	| 'pending'
	| 'red'
	| 'uncertified';
