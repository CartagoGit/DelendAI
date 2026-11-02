/** Contracts for `../../development-policy/publication-unit`. */
import type { PUBLICATION_GRANULARITIES } from '../constants/publication-granularity.constant';

export type IPublicationGranularity =
	(typeof PUBLICATION_GRANULARITIES)[number];

/** How work is grouped into pull requests. Never mixes proposals. */
export interface IPolicyPublication {
	readonly granularity: IPublicationGranularity;
	/**
	 * `adaptive` publishes a whole proposal as one pull request when it has
	 * at most `maxSlices` slices AND at most `maxChangedLines` changed
	 * lines across them; otherwise slice by slice.
	 */
	readonly adaptive: {
		readonly maxSlices: number;
		readonly maxChangedLines: number;
	};
}

/** What is known about the proposal being published. */
export interface IPublicationSubject {
	readonly proposalId: string;
	readonly sliceCount: number;
	/** Changed lines across its slices (added plus removed). */
	readonly changedLines: number;
}

export interface IPublicationUnit {
	readonly unit: 'slice' | 'proposal';
	readonly granularity: IPublicationGranularity;
	/** One sentence a person can read in `work status`. */
	readonly reason: string;
}
