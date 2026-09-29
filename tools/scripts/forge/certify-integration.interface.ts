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
 * finished and none passed; `uncertified` when none was ever started.
 */
export type IIntegrationCertification =
	| 'certified'
	| 'pending'
	| 'red'
	| 'uncertified';
