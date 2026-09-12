/** Types for `./derive-branch-policy`. */

/** A setting that says the opposite of the development policy. */
export interface IBranchPolicyConflict {
	readonly code: 'PUSH_TARGET_CONTRADICTS_POLICY';
	/** The config path to change, spelled as a project would write it. */
	readonly setting: string;
	readonly reason: string;
	readonly remedy: string;
}

/** What the push policy resolves to once the development policy is read. */
export interface IDerivedBranchPolicy {
	readonly protected: readonly string[];
	readonly conflicts: readonly IBranchPolicyConflict[];
}
