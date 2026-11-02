/**
 * Constants for `./anchor`.
 *
 * Split out of the implementation module so the repo's "constants live
 * in contracts" convention holds. Re-exported from `anchor.ts`, so no
 * import site changes.
 */

import type { IAnchorRequirement } from './anchor.interface';

/**
 * A checkout no policy constrains — the worktree model, where owning a
 * branch is the point, and test harnesses that drive arbitrary
 * repositories. Stating it is a decision; leaving the field out would
 * be an omission that looks identical.
 */
export const UNANCHORED: IAnchorRequirement = { required: false, branch: '' };
