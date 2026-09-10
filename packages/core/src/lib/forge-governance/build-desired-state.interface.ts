/**
 * Contract shapes for `./build-desired-state`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `build-desired-state.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `build-desired-state.ts`, so no import site changes.
 */

import type {
	IPolicyIntegration,
	IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';

/**
 * Overrides for decisions the policy contract cannot yet express.
 *
 * `approvals` is the seam for the human-review count. It lives here, and
 * not as a constant in this file, so the answer stays a project decision;
 * when `IResolvedDevelopmentPolicy` grows the field, this option becomes
 * the fallback and the policy becomes the source.
 */
export interface IBuildDesiredStateOptions {
	readonly approvals?: {
		readonly integration?: number;
		readonly release?: number;
	};
}
