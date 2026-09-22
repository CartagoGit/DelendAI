/** Constants for `../../lib/work-claim.service`. */

/**
 * The subject of a work ref: `${proposal}-${slice}-g${generation}/${topic}`.
 *
 * Read rather than assumed, because a claim must not invent a new shape:
 * the ref it produces has to be one the same policy would have produced
 * for the claiming agent from the start.
 */
export const WORK_SUBJECT_PATTERN =
	/^(?<proposal>[^/]+?)-(?<slice>S[^-/]*)-g(?<generation>\d+)\/(?<topic>.+)$/u;
