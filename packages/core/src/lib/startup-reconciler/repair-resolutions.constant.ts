/**
 * Constants for `./repair-resolutions`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `repair-resolutions.ts`
 * keeps the behaviour, this file keeps the constants. Re-exported from
 * `repair-resolutions.ts`, so no import site changes.
 */

/**
 * Where recorded decisions live, relative to the workspace root.
 *
 * WHY a tracked file and not the local journal: the blockers this
 * answers are derived from git, so they are raised identically on every
 * clone. A decision kept in this machine's database would leave every
 * teammate DEGRADED by a question that was already settled — and would
 * be invisible to review. A tracked file travels with the repository and
 * arrives through a pull request, which is what a decision of this
 * weight deserves.
 */
export const REPAIR_RESOLUTIONS_PATH =
	'config/delendai/repair-resolutions.json';

/** The decisions a human may record. Anything else is a parse error. */
export const REPAIR_DECISIONS = [
	'accepted-loss',
	'resolved-elsewhere',
	'not-a-problem',
] as const;

/** A resolution answered its task; the blocker is reported as a note. */
export const REPAIR_RESOLVED_CODE = 'repair.resolved-by-human';

/** A resolution names a task whose evidence has since changed. */
export const REPAIR_STALE_CODE = 'repair.resolution-stale';
