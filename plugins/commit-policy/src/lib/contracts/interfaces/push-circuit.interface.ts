/**
 * What the push breaker decided about one attempt.
 *
 * `announce` is true exactly once per opening, so the operator is told
 * the automatic path has stopped without the stop itself becoming a new
 * once-a-minute log line.
 */
export interface IPushCircuitDecision {
	/** The automatic path should stop attempting. */
	readonly open: boolean;
	/** Write the notice now (first transition into `open`). */
	readonly announce: boolean;
	/** How many consecutive identical failures have been seen. */
	readonly identicalFailures: number;
	/** The repeating refusal, when the breaker is open. */
	readonly refusal?: string;
}
