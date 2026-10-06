/**
 * Contract shapes for `./independent-candidates`.
 */

/** What a change touches: the test zones it reaches, and its files. */
export interface IChangeFootprint {
	/** `everything` when the planner cannot bound what it reaches. */
	readonly zones: ReadonlySet<string> | 'everything';
	readonly files: ReadonlySet<string>;
}

export interface IQueueCandidateChange {
	readonly number: number;
	readonly headRef: string;
	/** It carries the integration branch's tip: its checks ran on it. */
	readonly level: boolean;
	/** What the candidate changed since it left the integration branch. */
	readonly own: IChangeFootprint;
	/** What the integration branch changed since the candidate left it. */
	readonly integration: IChangeFootprint;
}

export interface ICandidateAcceptance {
	readonly number: number;
	readonly headRef: string;
	readonly accepted: boolean;
	readonly why: string;
}
