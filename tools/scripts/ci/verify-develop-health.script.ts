#!/usr/bin/env bun
/**
 * verify-develop-health.script.ts — v00125, x00276-x00279.
 *
 * Reads the REAL state of `develop` and `main` from the GitHub
 * API and compares it against `.github/branch-protection.ts`.
 * Produces a structured JSON report + exit code. Designed to run in
 * a nightly CI job that creates an issue on failure.
 *
 * Inputs:
 *   --repo <owner/repo>   REQUIRED. GitHub repo slug.
 *   --token <gh-token>    OPTIONAL. A deliberately-configured token
 *                          (repo-admin scope). Falls back to the
 *                          `BRANCH_PROTECTION_TOKEN` env var, then to
 *                          the ambient `GITHUB_TOKEN` — see
 *                          `verify-branch-protection.script.ts` for
 *                          why that distinction matters.
 *   --output <path>       OPTIONAL. Write the JSON report to a
 *                          file. Useful for the dashboard.
 *   --dry-run             OPTIONAL. Print the report to stdout.
 *
 * This script and `verify-branch-protection.script.ts` read the same
 * GitHub endpoint and MUST reach the same verdict for the same
 * fixture — they share `tools/scripts/ci/lib/github-protection.lib.ts`
 * for exactly that reason (AUD-A04: before the shared lib existed,
 * this script threw on 401/403 while its twin silently returned 0).
 *
 * Exit codes:
 *   0  'pass' (every branch read is healthy) or 'unverified' (no
 *      branch could be read and no token was explicitly supplied —
 *      visible via `::warning::` + `$GITHUB_STEP_SUMMARY`, never a
 *      silent green).
 *   1  'fail' — a branch that was read has drift, or an explicitly
 *      supplied token could not read a branch at all.
 *   2  config / input error.
 */
import { writeFile } from 'node:fs/promises';

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

const SCRIPT_NAME = 'verify-develop-health';

interface IBranchHealth {
	readonly name: string;
	readonly protected: boolean;
	/** Whether the declared policy expects this branch to be protected. */
	readonly expectedProtected: boolean;
	/** `false` when the branch could not be read at all (401/403). */
	readonly verified: boolean;
	readonly enforce_admins: boolean;
	readonly required_linear_history: boolean;
	readonly allow_force_pushes: boolean;
	readonly allow_deletions: boolean;
	readonly live_required_checks: readonly string[];
	readonly missing_checks: readonly string[];
	readonly extra_checks: readonly string[];
}

interface IHealthReport {
	readonly repo: string;
	readonly generatedAt: string;
	readonly healthy: boolean;
	readonly unverifiedBranches: readonly string[];
	readonly branches: readonly IBranchHealth[];
}

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

/**
 * Build the health record for one branch. `defaults` is the
 * expectation for every boolean field, passed explicitly rather than
 * hardcoded (AUD-A07) so a policy change in
 * `.github/branch-protection.ts` actually changes what this function
 * requires. `verified: false` means the branch could not be read at
 * all — it never contributes a false pass or a false drift.
 */
export const inspectBranch = (
	expected: IBranchProtectionConfig['branches'][number],
	live: IGitHubBranchProtectionResponse | null,
	verified: boolean,
	defaults: IBranchProtectionConfig['defaults'],
): IBranchHealth => {
	const liveChecks = live?.required_status_checks?.contexts ?? [];
	const expectedSet = new Set(expected.required_checks);
	return {
		name: expected.name,
		protected: live !== null,
		expectedProtected: expected.protected,
		verified,
		enforce_admins:
			live?.enforce_admins.enabled === defaults.enforce_admins,
		required_linear_history:
			live?.required_linear_history.enabled ===
			defaults.required_linear_history,
		allow_force_pushes:
			live?.allow_force_pushes.enabled === defaults.allow_force_pushes,
		allow_deletions:
			live?.allow_deletions.enabled === defaults.allow_deletions,
		live_required_checks: liveChecks,
		missing_checks: expected.required_checks.filter(
			(c) => !liveChecks.includes(c),
		),
		extra_checks: liveChecks.filter((c) => !expectedSet.has(c)),
	};
};

/**
 * A branch that could not be read contributes neither a pass nor a
 * drift — it is simply excluded from the health verdict. Only branches
 * that were actually read decide `healthy`; `main()` separately
 * refuses to call the run `healthy` when NO branch was read at all
 * (see the `readCount === 0` check), so `unverified` can never present
 * as `healthy: true` by vacuity.
 */
const isBranchHealthy = (b: IBranchHealth): boolean =>
	!b.expectedProtected
		? !b.protected
		: b.protected &&
			b.enforce_admins &&
			b.required_linear_history &&
			b.allow_force_pushes &&
			b.allow_deletions &&
			b.missing_checks.length === 0 &&
			b.extra_checks.length === 0;

export const isHealthy = (branches: readonly IBranchHealth[]): boolean => {
	const verified = branches.filter((b) => b.verified);
	if (verified.length === 0) return false;
	return verified.every(isBranchHealthy);
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const repo = flag(argv, 'repo');
	const explicitToken =
		flag(argv, 'token') ?? process.env.BRANCH_PROTECTION_TOKEN;
	const tokenExplicit =
		explicitToken !== undefined && explicitToken.length > 0;
	const token = explicitToken ?? process.env.GITHUB_TOKEN;
	const output = flag(argv, 'output');
	const dryRun = hasFlag(argv, 'dry-run');

	if (repo === undefined) {
		err('verify-develop-health: --repo <owner/repo> is required');
		return 2;
	}

	const config = BRANCH_PROTECTION;
	const branches: IBranchHealth[] = [];
	const unverifiedBranches: string[] = [];
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
				unverifiedBranches.push(expected.name);
				branches.push(
					inspectBranch(expected, null, false, config.defaults),
				);
				continue;
			}
			readCount += 1;
			const live = result.kind === 'live' ? result.data : null;
			branches.push(inspectBranch(expected, live, true, config.defaults));
		} catch (error) {
			if (!(error instanceof GitHubProtectionAuthError)) throw error;
			err(`verify-develop-health: ${error.message}`);
			return 1;
		}
	}

	if (unverifiedBranches.length > 0) {
		await reportUnverifiedBranches(SCRIPT_NAME, unverifiedBranches);
	}

	const report: IHealthReport = {
		repo,
		generatedAt: new Date().toISOString(),
		healthy: readCount > 0 && isHealthy(branches),
		unverifiedBranches,
		branches,
	};

	const json = JSON.stringify(report, null, 2);
	if (output !== undefined) {
		await writeFile(output, json, 'utf8');
	}
	if (dryRun || output === undefined) {
		out(json);
	}

	if (readCount === 0) {
		out(
			'verify-develop-health: no branch could be read with the token in use ' +
				'— nothing verified, nothing asserted.',
		);
		return 0;
	}
	if (report.healthy) {
		out(
			'verify-develop-health: develop + main match the declared policy ✓',
		);
		return 0;
	}
	err(`verify-develop-health: drift detected — see ${output ?? 'stdout'}`);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
