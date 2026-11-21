import type { IFunnelCounters } from '../interfaces/funnel-counters.interface';

/**
 * The ten stages of the error-reporting funnel, in pipeline order.
 * Each observed failure advances through at most one of these per
 * hop — a raw failure is either not internal (`notVertexInternal`),
 * blocked by privacy (`privacyBlocked`), skipped by the scheduler
 * (`deduplicated` / `rateLimited`), not claimed because the report store
 * could not be read (`dispatchUnclaimed`, a failure, not a duplicate) or
 * attempted (`submissionAttempted`
 * → `submissionSucceeded` | `submissionFailed`). `ignoredNonFailures`
 * is the odd one out: it counts successful tool calls the hook saw,
 * which is how an operator tells "nothing failed" apart from "the
 * hook is dead" (AUD-G01).
 */
export const FUNNEL_STAGES = [
	'observedFailures',
	'ignoredNonFailures',
	'notVertexInternal',
	'privacyBlocked',
	'deduplicated',
	'rateLimited',
	'dispatchUnclaimed',
	'submissionAttempted',
	'submissionSucceeded',
	'submissionFailed',
] as const;

/** Every stage at zero: nothing observed yet. */
export const EMPTY_FUNNEL_COUNTERS: IFunnelCounters = {
	observedFailures: 0,
	ignoredNonFailures: 0,
	notVertexInternal: 0,
	privacyBlocked: 0,
	deduplicated: 0,
	rateLimited: 0,
	dispatchUnclaimed: 0,
	submissionAttempted: 0,
	submissionSucceeded: 0,
	submissionFailed: 0,
};
