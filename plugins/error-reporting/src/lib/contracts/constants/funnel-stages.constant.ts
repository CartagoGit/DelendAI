/**
 * The nine stages of the error-reporting funnel, in pipeline order.
 * Each observed failure advances through at most one of these per
 * hop — a raw failure is either not internal (`notVertexInternal`),
 * blocked by privacy (`privacyBlocked`), skipped by the scheduler
 * (`deduplicated` / `rateLimited`) or attempted (`submissionAttempted`
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
	'submissionAttempted',
	'submissionSucceeded',
	'submissionFailed',
] as const;
