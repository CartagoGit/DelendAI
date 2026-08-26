/**
 * branch-protection.ts — declarative GitHub branch protection policy
 * for `@mcp-vertex/core` (c00130 / AUD-P0-001).
 *
 * This file is the **single source of truth** for the branch
 * protection policy that `develop` and `main` MUST have. The
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
 */

export interface IBranchProtectionConfig {
	readonly version: number;
	readonly defaults: {
		readonly enforce_admins: boolean;
		readonly required_linear_history: boolean;
		readonly allow_force_pushes: boolean;
		readonly allow_deletions: boolean;
	};
	readonly branches: readonly {
		readonly name: string;
		readonly required_checks: readonly string[];
	}[];
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
			name: 'develop',
			required_checks: [
				'lint-biome',
				'lint-architecture',
				'lint-presets',
				'lint-docs',
				'lint-security',
				'lint-governance',
				'typecheck',
				'tests',
				'quality-gate',
				'verify-runtime',
				'tokens-budget-real',
				'manifests-check',
				'generated-artifacts-check',
				'web site build',
				'pack smoke (publishable packages)',
				'metrics longitudinal regression gate (f00027)',
			],
		},
		{
			name: 'main',
			required_checks: [
				'lint-biome',
				'lint-architecture',
				'lint-presets',
				'lint-docs',
				'lint-security',
				'lint-governance',
				'typecheck',
				'tests',
				'quality-gate',
				'verify-runtime',
				'tokens-budget-real',
				'manifests-check',
				'generated-artifacts-check',
				'web site build',
				'pack smoke (publishable packages)',
				'metrics longitudinal regression gate (f00027)',
			],
		},
	],
};
