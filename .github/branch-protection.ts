/**
 * branch-protection.ts — declarative GitHub branch protection policy
 * for `@mcp-vertex/core` (c00130 / AUD-P0-001).
 *
 * This file is the **single source of truth** for the branch
 * protection policy that declares `develop` as an open snapshot journal and
 * `main` as the protected release boundary. The
 * `tools/scripts/ci/verify-branch-protection.script.ts` script
 * diff-fetches the live GitHub state against this file and
 * fails the gate when the real repo diverges.
 *
 * IMPORTANT — this is NOT a GitHub-API native format. GitHub
 * exposes branch protection via REST endpoints that require the
 * `admin:repo` OAuth scope; CI must NEVER assume that scope.
 * Instead, a human operator applies the equivalent UI/API settings
 * (documented in `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`)
 * and the verifier compares the result against this file.
 *
 * Schema (deliberately small — only the keys we enforce):
 *
 *   version                schema version. Bump when the shape changes.
 *   defaults.*             booleans that apply to every branch.
 *   branches[].name        branch name (matches GitHub).
 *   branches[].required_checks
 *                          list of required status-check names; must
 *                          match the `name:` field in
 *                          `.github/workflows/*.yml`.
 *
 * `required_checks` names a single aggregate check (`ci-complete`) per
 * branch, not each individual CI job. Naming every job here used to be
 * brittle both ways: renaming a job silently dropped it from the
 * required set, and adding a job silently protected nothing until this
 * file was also updated. `ci-complete` `needs` every job in
 * `.github/workflows/ci.yml` and only reports success when all of them
 * do — so this file only has to name the one job that already speaks
 * for the rest.
 */

export interface IBranchProtectionConfig {
	readonly version: number;
	readonly defaults: {
		readonly enforce_admins: boolean;
		readonly required_linear_history: boolean;
		readonly allow_force_pushes: boolean;
		readonly allow_deletions: boolean;
	};
	readonly branches: readonly IBranchPolicy[];
}

/**
 * Per-branch policy. `protected: false` declares a deliberately
 * unprotected working branch — the verifier then treats "GitHub has no
 * rule here" as the expected state rather than as drift, which is what
 * lets `develop` stay a normal branch people push to while `main` stays
 * locked down. A single global `defaults` block is what forced the two
 * branches to share one policy in the first place.
 */
export interface IBranchPolicy {
	readonly name: string;
	readonly protected: boolean;
	readonly required_checks: readonly string[];
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
			// Shared snapshot journal. Concurrent agent commits and pushes are
			// intentionally allowed; main is the review boundary.
			name: 'develop',
			protected: false,
			required_checks: [],
		},
		{
			// The release branch. Nothing lands here automatically.
			name: 'main',
			protected: true,
			required_checks: ['ci-complete', 'release-pr-gate'],
		},
	],
};
