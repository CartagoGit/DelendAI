/**
 * Constants for `./types`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `types.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `types.ts`, so no import site changes.
 */

/** Verdict of the required checks for one candidate sha. */
export const VALIDATION_VERDICTS = ['green', 'red', 'pending'] as const;

/**
 * Outcome of one cycle. The discriminator is deliberately fine-grained:
 * an orchestrator schedules very differently for `awaiting-checks`
 * (wait), `revalidating` (CI is running again on a rebased candidate),
 * `stale` (retry immediately, the head moved under us) and `blocked`
 * (hand back to the agent — the work is red).
 */
export const CYCLE_STATUSES = [
	/** The policy does not use pull requests; this engine declined. */
	'declined',
	/** A pull request was opened for this candidate. */
	'opened',
	/** The existing pull request was advanced to a new candidate sha. */
	'updated',
	/** Required checks have not concluded yet. */
	'awaiting-checks',
	/** Required human approvals are missing. */
	'awaiting-approval',
	/** Required checks are red — the candidate must not merge. */
	'blocked',
	/** The head moved; the candidate was rebased and needs new checks. */
	'revalidating',
	/** The head moved between validation and merge; the CAS refused. */
	'stale',
	/** The candidate merged and the integration branch advanced. */
	'merged',
	/** The rebase onto the new head could not be replayed. */
	'RECOVERY_CONFLICT',
	/** Something below the engine failed (git, forge transport). */
	'failed',
] as const;
