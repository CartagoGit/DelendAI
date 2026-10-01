/** Types for `./derive-branch-policy`. */

/** What the push policy resolves to once the development policy is read. */
export interface IDerivedBranchPolicy {
	readonly protected: readonly string[];
}
