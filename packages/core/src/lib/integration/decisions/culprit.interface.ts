/**
 * Contract shapes for `./culprit`: a batch member, and the integration
 * branch's certification.
 */

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

/** A train candidate: its number, branch and current head. */
export interface ITrainCandidate {
	readonly number: number;
	readonly headRef: string;
	readonly headSha: string;
}
