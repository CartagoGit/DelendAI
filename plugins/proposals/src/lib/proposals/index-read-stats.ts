/**
 * index-read-stats.ts — in-process counters for the proposal index read
 * path.
 *
 * `auto` logs a fallback once per index path, so the log can say that a
 * fallback happened but not how often. These counters are that number.
 * They answer "what has this server actually been serving?", which the
 * doctor reports next to the configured mode. The state is per process on
 * purpose: a fresh process has observed nothing, and says so.
 */

import type {
	IProposalIndexParityStatus,
	IProposalIndexReadOutcome,
	IProposalIndexReadStats,
} from '../contracts/interfaces/proposal-index-read-stats.interface';

const FALLBACK_OUTCOMES: ReadonlySet<IProposalIndexReadOutcome> = new Set([
	'fallback-unavailable',
	'fallback-metadata-missing',
	'fallback-divergence',
]);

let stats: IProposalIndexReadStats = {
	reads: 0,
	fallbacks: 0,
	last: null,
	lastDivergence: 0,
};

export const recordProposalIndexRead = (
	outcome: IProposalIndexReadOutcome,
	divergence = 0,
): void => {
	stats = {
		reads: stats.reads + 1,
		fallbacks: stats.fallbacks + (FALLBACK_OUTCOMES.has(outcome) ? 1 : 0),
		last: outcome,
		lastDivergence: divergence,
	};
};

export const getProposalIndexReadStats = (): IProposalIndexReadStats => stats;

/** Clears the counters. For tests; production never resets them. */
export const resetProposalIndexReadStats = (): void => {
	stats = { reads: 0, fallbacks: 0, last: null, lastDivergence: 0 };
};

const PARITY_BY_OUTCOME: Readonly<
	Record<IProposalIndexReadOutcome, IProposalIndexParityStatus>
> = {
	'json-pinned': 'not-compared',
	'sql-parity': 'parity',
	'sql-divergence-reported': 'divergent',
	'sql-refused': 'unverified',
	'fallback-unavailable': 'unverified',
	'fallback-metadata-missing': 'unverified',
	'fallback-divergence': 'divergent',
};

export const parityStatusOf = (
	last: IProposalIndexReadOutcome | null,
): IProposalIndexParityStatus =>
	last === null ? 'not-observed' : PARITY_BY_OUTCOME[last];
