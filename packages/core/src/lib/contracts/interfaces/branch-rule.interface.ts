/**
 * branch-rule.interface.ts — how one branch of a project takes in work.
 *
 * A branch takes in work by pull request, by merge, or by direct commits
 * and pushes. The three are ordered by how much stands between a change
 * and the branch: the order is what lets a release branch be checked
 * against the integration branch it is released from.
 */

/** From the strictest way to take in work to the loosest. */
export const BRANCH_TAKE_IN_MODES = [
	'pull-request',
	'merge',
	'direct',
] as const;
export type IBranchTakeIn = (typeof BRANCH_TAKE_IN_MODES)[number];

/** One declared rule: a branch name or glob and how it takes in work. */
export interface IBranchRule {
	/** A branch name, or a glob (`*` within a segment, `**` across them). */
	readonly pattern: string;
	/** Carried through unrecognised so validation can name it back. */
	readonly takesIn: IBranchTakeIn;
	/** The branch this one is promoted from (`main` from `develop`). */
	readonly promotedFrom?: string;
	/** The branch this one takes in after that one moves. */
	readonly follows?: string;
}
