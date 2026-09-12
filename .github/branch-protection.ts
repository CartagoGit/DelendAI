// GENERATED — do not edit.
//
// Projection of the canonical development policy in
// `delendai.config.json`. Change the policy, then run:
//   bun tools/scripts/governance/forge-settings.script.ts --write

/** Global shape every protected branch is held to. */
export interface IBranchProtectionDefaults {
	readonly enforce_admins: boolean;
	readonly required_linear_history: boolean;
	readonly allow_force_pushes: boolean;
	readonly allow_deletions: boolean;
}

/** One branch, and the checks it requires. */
export interface IBranchPolicy {
	readonly name: string;
	readonly protected: boolean;
	readonly required_checks: readonly string[];
}

export interface IBranchProtectionConfig {
	readonly version: number;
	readonly defaults: IBranchProtectionDefaults;
	readonly branches: readonly IBranchPolicy[];
}

export const BRANCH_PROTECTION: IBranchProtectionConfig = {
	version: 1,
	defaults: {
		enforce_admins: true,
		required_linear_history: true,
		allow_force_pushes: false,
		allow_deletions: false,
	},
	branches: [
		{
			// The integration branch: where certified work lands.
			name: 'develop',
			protected: true,
			required_checks: ['delendai-validate'],
		},
		{
			// The release branch: the promotion boundary.
			name: 'main',
			protected: true,
			required_checks: ['delendai-validate', 'release-pr-gate'],
		},
	],
};
