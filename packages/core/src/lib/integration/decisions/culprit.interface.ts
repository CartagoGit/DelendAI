/**
 * Contract shapes for `./culprit`: a train, its steps and its verdicts.
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

/**
 * What the queue does with a train: land the members whose train passed
 * (naming a culprit when bisection isolated one beside them), dispatch the
 * full run of a train that has none, wait for one that is running, report
 * the member whose train of one is red, or nothing when there is no train.
 */
export type ITrainStep =
	| {
			readonly kind: 'land';
			readonly members: readonly number[];
			readonly culprit?: number;
	  }
	| { readonly kind: 'dispatch'; readonly members: readonly number[] }
	| { readonly kind: 'wait'; readonly members: readonly number[] }
	| { readonly kind: 'culprit'; readonly number: number }
	| { readonly kind: 'none' };

/** A train candidate: its number, branch and current head. */
export interface ITrainCandidate {
	readonly number: number;
	readonly headRef: string;
	readonly headSha: string;
}
