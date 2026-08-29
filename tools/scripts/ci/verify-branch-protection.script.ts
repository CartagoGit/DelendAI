#!/usr/bin/env bun
/**
 * verify-branch-protection.script.ts — c00130 (AUD-P0-001), x00276-x00279.
 *
 * Diff-fetches the real GitHub branch protection state for
 * `develop` + `main` against `.github/branch-protection.ts`
 * and exits non-zero when they diverge. Designed to run in
 * the `quality-gate` CI job so a missed protection setting
 * blocks the merge.
 *
 * Inputs (CLI flags):
 *
 *   --repo <owner/repo>      REQUIRED. The GitHub repo slug.
 *   --token <gh-token>       OPTIONAL. A deliberately-configured token
 *                             (repo-admin scope). Falls back to the
 *                             `BRANCH_PROTECTION_TOKEN` env var, then
 *                             to the ambient `GITHUB_TOKEN` — the last
 *                             of which is known to lack the scope this
 *                             endpoint needs, so it is treated as "no
 *                             explicit token" (see `--dry-run` and the
 *                             `unverified` verdict below).
 *   --dry-run                OPTIONAL. Print the policy and exit 0
 *                             without contacting GitHub. Useful
 *                             for local development.
 *
 * Verdict model (three states, not a boolean):
 *   'pass'        — at least one branch was read and none of the
 *                    branches read has drift.
 *   'fail'        — a branch that was read has drift, OR an explicitly
 *                    supplied token could not read a branch at all
 *                    (misconfiguration, not an expected gap).
 *   'unverified'  — no branch could be read, and no token was
 *                    explicitly supplied. Exits 0 (the workflow's
 *                    ambient token has no way to do better) but is
 *                    never silent: a `::warning::` and a
 *                    `$GITHUB_STEP_SUMMARY` line make it visible
 *                    without opening the log. AUD-A05 was exactly the
 *                    absence of this: a green check indistinguishable
 *                    from "verified and correct".
 *
 * A branch that could not be read never masks a branch that could: a
 * readable branch's drift is always reported, however many other
 * branches were unreadable.
 *
 * Exit codes:
 *   0 — 'pass' or 'unverified'.
 *   1 — 'fail'.
 *   2 — input/config error (no repo, malformed config, etc.).
 *
 * The verifier is **read-only**: it never writes back to GitHub.
 * A human operator applies the changes via the UI/API (see
 * `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`).
 */

import {
	BRANCH_PROTECTION,
	type IBranchProtectionConfig,
} from '../../../.github/branch-protection.ts';
import {
	fetchBranchProtection,
	GitHubProtectionAuthError,
	type IGitHubBranchProtectionResponse,
	reportUnverifiedBranches,
} from './lib/github-protection.lib.ts';

const SCRIPT_NAME = 'verify-branch-protection';

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

interface IDrift {
	readonly branch: string;
	readonly kind: 'MISSING' | 'CHECK_DRIFT' | 'BOOL_DRIFT';
	readonly detail: string;
}

/**
 * Compute the drift between declared policy and live GitHub state.
 * Returns an empty array when the branch matches. `defaults` is the
 * expectation for every boolean field — passed explicitly rather than
 * imported so this stays a pure function testable against any
 * combination, and so no expectation is ever hardcoded here again
 * (AUD-A07: `config.defaults` used to be printed in `--dry-run` and
 * nowhere else).
 */
export const diffBranch = (
	expected: IBranchProtectionConfig['branches'][number],
	live: IGitHubBranchProtectionResponse | null,
	defaults: IBranchProtectionConfig['defaults'],
): readonly IDrift[] => {
	// A branch declared unprotected is supposed to have no rule. Finding
	// one is drift in the other direction: someone locked down a working
	// branch without updating the declared policy.
	if (!expected.protected) {
		return live === null
			? []
			: [
					{
						branch: expected.name,
						kind: 'BOOL_DRIFT',
						detail: 'branch is declared unprotected but GitHub has a protection rule on it',
					},
				];
	}
	if (live === null) {
		return [
			{
				branch: expected.name,
				kind: 'MISSING',
				detail: 'branch has no protection rule on GitHub',
			},
		];
	}
	const drifts: IDrift[] = [];
	if (live.enforce_admins.enabled !== defaults.enforce_admins) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `enforce_admins must be ${defaults.enforce_admins} (got ${live.enforce_admins.enabled})`,
		});
	}
	if (
		live.required_linear_history.enabled !==
		defaults.required_linear_history
	) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `required_linear_history must be ${defaults.required_linear_history} (got ${live.required_linear_history.enabled})`,
		});
	}
	if (live.allow_force_pushes.enabled !== defaults.allow_force_pushes) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_force_pushes must be ${defaults.allow_force_pushes} (got ${live.allow_force_pushes.enabled})`,
		});
	}
	if (live.allow_deletions.enabled !== defaults.allow_deletions) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_deletions must be ${defaults.allow_deletions} (got ${live.allow_deletions.enabled})`,
		});
	}
	const liveChecks = live.required_status_checks?.contexts ?? [];
	const expectedChecks = new Set(expected.required_checks);
	const missing = expected.required_checks.filter(
		(c) => !liveChecks.includes(c),
	);
	if (missing.length > 0) {
		drifts.push({
			branch: expected.name,
			kind: 'CHECK_DRIFT',
			detail: `missing required checks: ${missing.join(', ')}`,
		});
	}
	const unexpected = liveChecks.filter((c) => !expectedChecks.has(c));
	if (unexpected.length > 0) {
		drifts.push({
			branch: expected.name,
			kind: 'CHECK_DRIFT',
			detail: `extra checks not declared: ${unexpected.join(', ')}`,
		});
	}
	return drifts;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const repo = flag(argv, 'repo');
	const dryRun = hasFlag(argv, 'dry-run');
	const explicitToken =
		flag(argv, 'token') ?? process.env.BRANCH_PROTECTION_TOKEN;
	const tokenExplicit =
		explicitToken !== undefined && explicitToken.length > 0;
	const token = explicitToken ?? process.env.GITHUB_TOKEN;

	const config = BRANCH_PROTECTION;
	if (config.version !== 1) {
		err(
			`verify-branch-protection: unsupported config version ${config.version}`,
		);
		return 2;
	}

	if (dryRun) {
		out(
			`verify-branch-protection: dry-run; would verify ${config.branches.length} branch(es)`,
		);
		for (const b of config.branches) {
			out(
				`  - ${b.name} — checks=${b.required_checks.length}, enforce_admins=${config.defaults.enforce_admins}, required_linear_history=${config.defaults.required_linear_history}, allow_force_pushes=${config.defaults.allow_force_pushes}, allow_deletions=${config.defaults.allow_deletions}`,
			);
		}
		return 0;
	}

	// After the dry-run early return, a repo is genuinely required — and
	// checking it here rather than earlier lets the compiler narrow it.
	if (repo === undefined) {
		err('verify-branch-protection: --repo <owner/repo> is required');
		return 2;
	}

	const allDrifts: IDrift[] = [];
	const unverifiable: string[] = [];
	let readCount = 0;
	for (const expected of config.branches) {
		try {
			const result = await fetchBranchProtection({
				repo,
				branch: expected.name,
				token,
				tokenExplicit,
			});
			if (result.kind === 'unverified') {
				unverifiable.push(expected.name);
				continue;
			}
			readCount += 1;
			const live = result.kind === 'live' ? result.data : null;
			allDrifts.push(...diffBranch(expected, live, config.defaults));
		} catch (error) {
			if (!(error instanceof GitHubProtectionAuthError)) throw error;
			// A token that was explicitly supplied for this purpose and still
			// can't read is a misconfiguration, not an expected gap: it must
			// fail loud, not fall back to `unverified`.
			err(`verify-branch-protection: ${error.message}`);
			return 1;
		}
	}

	if (unverifiable.length > 0) {
		await reportUnverifiedBranches(SCRIPT_NAME, unverifiable);
	}

	// A branch that couldn't be read never masks one that could — a
	// readable branch with real drift always fails, however many other
	// branches were unreadable. Only the total absence of any reading
	// collapses to `unverified`.
	if (readCount === 0) {
		out(
			'verify-branch-protection: no branch could be read with the token in ' +
				'use — nothing verified, nothing asserted.',
		);
		return 0;
	}
	if (allDrifts.length === 0) {
		out(
			`verify-branch-protection: ${readCount} of ${config.branches.length} branch(es) read match the declared policy ✓`,
		);
		return 0;
	}
	for (const d of allDrifts) {
		err(`verify-branch-protection: ${d.branch} ${d.kind} — ${d.detail}`);
	}
	err(
		`verify-branch-protection: ${allDrifts.length} drift(s) — see docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`,
	);
	return 1;
};

if (import.meta.main) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
