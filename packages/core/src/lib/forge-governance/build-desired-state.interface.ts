/**
 * Contract shapes for `./build-desired-state`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `build-desired-state.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `build-desired-state.ts`, so no import site changes.
 */

/**
 * Overrides for decisions the policy contract cannot yet express.
 *
 * `approvals` WAS the seam for the human-review count while the policy
 * could not express it. The policy now carries `requiredApprovals` and
 * `releaseRequiredApprovals`, so that transition is complete: the policy
 * is the source and this option is an explicit per-call override, used
 * by callers that need to ask "what would N approvals look like" without
 * editing config.
 */
export interface IBuildDesiredStateOptions {
	readonly approvals?: {
		readonly integration?: number;
		readonly release?: number;
	};
}
