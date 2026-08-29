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
 *   --dry-run             OPTIONAL. Print an offline, unverified report.
 *   --real                OPTIONAL. Explicitly contact GitHub (the default).
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

import z from 'zod';

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
const GITHUB_API_VERSION = '2022-11-28';
const PASSING_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

type TDevelopCiStatus = 'green' | 'red' | 'unknown';

const githubCheckRunSchema = z.object({
	name: z.string(),
	status: z.string(),
	conclusion: z.string().nullable().optional(),
	head_sha: z.string().optional(),
	html_url: z.string().url().nullable().optional(),
});

const githubCheckRunsResponseSchema = z.object({
	check_runs: z.array(githubCheckRunSchema).default([]),
});

type IGitHubCheckRunsResponse = z.infer<typeof githubCheckRunsResponseSchema>;

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

interface IRequiredCheckRun {
	readonly name: string;
	readonly status: string | null;
	readonly conclusion: string | null;
	readonly htmlUrl: string | null;
}

interface IDevelopStatus {
	readonly ref: 'develop';
	readonly verified: boolean;
	readonly headSha: string | null;
	readonly ciStatus: TDevelopCiStatus;
	readonly totalCheckRuns: number;
	readonly requiredCheckRuns: readonly IRequiredCheckRun[];
}

interface IDevelopHealthDashboard {
	readonly $schema: string;
	readonly lastVerifiedAt: string | null;
	readonly ciStatus: TDevelopCiStatus;
	readonly protectedBranches: {
		readonly main: boolean | null;
		readonly develop: boolean | null;
	};
	readonly requiredChecks: readonly string[];
	readonly discrepancies: readonly string[];
	readonly note: string;
}

interface IHealthReport {
	readonly repo: string;
	readonly generatedAt: string;
	readonly healthy: boolean;
	readonly unverifiedBranches: readonly string[];
	readonly branches: readonly IBranchHealth[];
	readonly developStatus: IDevelopStatus;
	readonly discrepancies: readonly string[];
	readonly dashboard: IDevelopHealthDashboard;
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
	argv.some(
		(token) => token === `--${name}` || token.startsWith(`--${name}=`),
	);

const githubHeaders = (token: string | undefined): Record<string, string> => {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': GITHUB_API_VERSION,
	};
	if (token !== undefined && token.length > 0) {
		headers.Authorization = `Bearer ${token}`;
	}
	return headers;
};

const collectRequiredChecks = (
	branches: IBranchProtectionConfig['branches'],
): string[] =>
	Array.from(
		new Set(
			branches
				.filter((branch) => branch.protected)
				.flatMap((branch) => branch.required_checks),
		),
	).sort();

const parseGitHubCheckRunsResponse = (
	json: unknown,
): IGitHubCheckRunsResponse => githubCheckRunsResponseSchema.parse(json);

const isPassingConclusion = (conclusion: string | null): boolean =>
	conclusion !== null && PASSING_CHECK_CONCLUSIONS.has(conclusion);

const getProtectedBranchState = (
	branches: readonly IBranchHealth[],
	name: string,
): boolean | null => {
	const branch = branches.find((candidate) => candidate.name === name);
	if (branch === undefined || !branch.verified) return null;
	return branch.protected;
};

const collectBranchDiscrepancies = (
	branches: readonly IBranchHealth[],
): string[] => {
	const discrepancies: string[] = [];
	for (const branch of branches) {
		if (!branch.verified) {
			discrepancies.push(
				`${branch.name}: branch protection could not be verified with the token in use`,
			);
			continue;
		}
		if (branch.expectedProtected && !branch.protected) {
			discrepancies.push(
				`${branch.name}: branch protection is missing but declared protected`,
			);
		}
		if (!branch.expectedProtected && branch.protected) {
			discrepancies.push(
				`${branch.name}: branch is protected but declared unprotected`,
			);
		}
		if (!branch.expectedProtected) continue;
		if (!branch.enforce_admins) {
			discrepancies.push(`${branch.name}: enforce_admins drift detected`);
		}
		if (!branch.required_linear_history) {
			discrepancies.push(
				`${branch.name}: required_linear_history drift detected`,
			);
		}
		if (!branch.allow_force_pushes) {
			discrepancies.push(
				`${branch.name}: allow_force_pushes drift detected`,
			);
		}
		if (!branch.allow_deletions) {
			discrepancies.push(
				`${branch.name}: allow_deletions drift detected`,
			);
		}
		for (const check of branch.missing_checks) {
			discrepancies.push(
				`${branch.name}: missing required status check "${check}"`,
			);
		}
		for (const check of branch.extra_checks) {
			discrepancies.push(
				`${branch.name}: unexpected live status check "${check}"`,
			);
		}
	}
	return discrepancies;
};

const collectDevelopStatusDiscrepancies = (
	developStatus: IDevelopStatus,
): string[] => {
	if (!developStatus.verified) {
		return [
			'develop: latest commit CI could not be verified with the token in use',
		];
	}
	const discrepancies: string[] = [];
	for (const check of developStatus.requiredCheckRuns) {
		if (check.status === null) {
			discrepancies.push(
				`develop: missing check-run "${check.name}" on the latest commit`,
			);
			continue;
		}
		if (check.status !== 'completed') {
			discrepancies.push(
				`develop: check-run "${check.name}" is still ${check.status}`,
			);
			continue;
		}
		if (!isPassingConclusion(check.conclusion)) {
			discrepancies.push(
				`develop: check-run "${check.name}" concluded ${check.conclusion ?? 'null'}`,
			);
		}
	}
	return discrepancies;
};

const buildDashboard = (
	report: Pick<
		IHealthReport,
		'generatedAt' | 'branches' | 'developStatus' | 'discrepancies'
	> & { readonly requiredChecks: readonly string[] },
): IDevelopHealthDashboard => ({
	$schema: 'https://mcp-vertex.dev/schemas/develop-health.v1.json',
	lastVerifiedAt:
		report.developStatus.verified &&
		report.branches.some((branch) => branch.verified)
			? report.generatedAt
			: null,
	ciStatus: report.developStatus.ciStatus,
	protectedBranches: {
		main: getProtectedBranchState(report.branches, 'main'),
		develop: getProtectedBranchState(report.branches, 'develop'),
	},
	requiredChecks: report.requiredChecks,
	discrepancies: report.discrepancies,
	note: 'Auto-populated by bun tools/scripts/ci/verify-develop-health.script.ts.',
});

const buildDryRunReport = (
	repo: string,
	branches: readonly IBranchHealth[],
	requiredChecks: readonly string[],
): IHealthReport => {
	const discrepancies = [
		'dry-run: GitHub API was not contacted; live CI and branch protection are unverified',
	];
	const developStatus: IDevelopStatus = {
		ref: 'develop',
		verified: false,
		headSha: null,
		ciStatus: 'unknown',
		totalCheckRuns: 0,
		requiredCheckRuns: requiredChecks.map((name) => ({
			name,
			status: null,
			conclusion: null,
			htmlUrl: null,
		})),
	};
	const generatedAt = new Date().toISOString();
	const dashboard = buildDashboard({
		generatedAt,
		branches,
		developStatus,
		discrepancies,
		requiredChecks,
	});
	return {
		repo,
		generatedAt,
		healthy: false,
		unverifiedBranches: branches.map((branch) => branch.name),
		branches,
		developStatus,
		discrepancies,
		dashboard: { ...dashboard, lastVerifiedAt: null },
	};
};

const fetchDevelopStatus = async (params: {
	readonly repo: string;
	readonly token: string | undefined;
	readonly tokenExplicit: boolean;
	readonly requiredChecks: readonly string[];
}): Promise<IDevelopStatus> => {
	const { repo, token, tokenExplicit, requiredChecks } = params;
	const res = await fetch(
		`https://api.github.com/repos/${repo}/commits/develop/check-runs`,
		{ headers: githubHeaders(token) },
	);
	if (res.status === 401 || res.status === 403) {
		if (tokenExplicit) {
			throw new Error(
				'develop check-runs are not readable with the token supplied — the token needs repo read access and checks visibility for this repository.',
			);
		}
		return {
			ref: 'develop',
			verified: false,
			headSha: null,
			ciStatus: 'unknown',
			totalCheckRuns: 0,
			requiredCheckRuns: requiredChecks.map((name) => ({
				name,
				status: null,
				conclusion: null,
				htmlUrl: null,
			})),
		};
	}
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on develop check-runs: ${await res.text()}`,
		);
	}
	const payload = parseGitHubCheckRunsResponse(await res.json());
	const requiredCheckRuns = requiredChecks.map((name) => {
		const live = payload.check_runs.find(
			(checkRun) => checkRun.name === name,
		);
		return {
			name,
			status: live?.status ?? null,
			conclusion: live?.conclusion ?? null,
			htmlUrl: live?.html_url ?? null,
		};
	});
	const ciStatus: TDevelopCiStatus =
		requiredCheckRuns.length === 0
			? payload.check_runs.length === 0
				? 'unknown'
				: payload.check_runs.every(
							(checkRun) =>
								checkRun.status === 'completed' &&
								isPassingConclusion(
									checkRun.conclusion ?? null,
								),
						)
					? 'green'
					: 'red'
			: requiredCheckRuns.every(
						(checkRun) =>
							checkRun.status === 'completed' &&
							isPassingConclusion(checkRun.conclusion),
					)
				? 'green'
				: 'red';
	return {
		ref: 'develop',
		verified: true,
		headSha: payload.check_runs[0]?.head_sha ?? null,
		ciStatus,
		totalCheckRuns: payload.check_runs.length,
		requiredCheckRuns,
	};
};

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
	const dryRun = hasFlag(argv, 'dry-run');
	const explicitToken =
		flag(argv, 'token') ?? process.env.BRANCH_PROTECTION_TOKEN;
	const tokenExplicit =
		explicitToken !== undefined && explicitToken.length > 0;
	const token = explicitToken ?? process.env.GITHUB_TOKEN;
	const output = flag(argv, 'output');

	if (repo === undefined) {
		err('verify-develop-health: --repo <owner/repo> is required');
		return 2;
	}

	const config = BRANCH_PROTECTION;
	const requiredChecks = collectRequiredChecks(config.branches);
	if (dryRun) {
		const branches = config.branches.map((expected) =>
			inspectBranch(expected, null, false, config.defaults),
		);
		out(
			JSON.stringify(
				buildDryRunReport(repo, branches, requiredChecks),
				null,
				2,
			),
		);
		return 0;
	}
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

	const developStatus = await fetchDevelopStatus({
		repo,
		token,
		tokenExplicit,
		requiredChecks,
	});
	const discrepancies = [
		...collectBranchDiscrepancies(branches),
		...collectDevelopStatusDiscrepancies(developStatus),
	];

	const dashboard = buildDashboard({
		generatedAt: new Date().toISOString(),
		branches,
		developStatus,
		discrepancies,
		requiredChecks,
	});

	const report: IHealthReport = {
		repo,
		generatedAt: dashboard.lastVerifiedAt ?? new Date().toISOString(),
		healthy:
			readCount > 0 &&
			isHealthy(branches) &&
			developStatus.verified &&
			developStatus.ciStatus === 'green',
		unverifiedBranches,
		branches,
		developStatus,
		discrepancies,
		dashboard,
	};

	const json = JSON.stringify(report, null, 2);
	if (output !== undefined) {
		await writeFile(
			output,
			`${JSON.stringify(dashboard, null, 2)}\n`,
			'utf8',
		);
	}
	out(json);

	if (readCount === 0) {
		err(
			'verify-develop-health: no branch could be read with the token in use ' +
				'— nothing verified, nothing asserted.',
		);
		return developStatus.ciStatus === 'red' ? 1 : 0;
	}
	if (report.healthy) {
		err(
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
