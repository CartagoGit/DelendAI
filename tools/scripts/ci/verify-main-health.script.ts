#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';

import z from 'zod';

import {
	fetchBranchProtection,
	GitHubProtectionAuthError,
	type IGitHubBranchProtectionResponse,
} from './lib/github-protection.lib.ts';
import {
	loadDeclaredBranchProtectionConfig,
	type IDeclaredBranchPolicy,
} from './verify-branch-protection.script.ts';
import { REPOSITORY_SLUG } from '@delendai/core/public';

const SCRIPT_NAME = 'verify-main-health';
const DEFAULT_REPOSITORY = REPOSITORY_SLUG;
const GITHUB_API_VERSION = '2022-11-28';
const PASSING_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

type TBranchRole = 'gate' | 'observation';
type TBranchCiStatus = 'green' | 'red' | 'unknown';

const githubCheckRunSchema = z.object({
	id: z.number().int().optional(),
	name: z.string(),
	status: z.string(),
	conclusion: z.string().nullable().optional(),
	head_sha: z.string().optional(),
	html_url: z.string().url().nullable().optional(),
});

const githubCheckRunsResponseSchema = z.object({
	check_runs: z.array(githubCheckRunSchema).default([]),
});

type IGitHubCheckRun = z.infer<typeof githubCheckRunSchema>;
type IGitHubCheckRunsResponse = z.infer<typeof githubCheckRunsResponseSchema>;

export interface IRequiredCheckRun {
	readonly id: number | null;
	readonly name: string;
	readonly status: string | null;
	readonly conclusion: string | null;
	readonly htmlUrl: string | null;
}

export interface IBranchProtectionSnapshot {
	readonly verified: boolean;
	readonly protected: boolean;
	readonly requiredStatusChecks: {
		readonly strict: boolean | null;
		readonly contexts: readonly string[];
	};
	readonly enforceAdmins: boolean | null;
	readonly requiredLinearHistory: boolean | null;
	readonly allowForcePushes: boolean | null;
	readonly allowDeletions: boolean | null;
	readonly raw: IGitHubBranchProtectionResponse | null;
	readonly diff: readonly string[];
}

export interface IBranchReport {
	readonly ref: string;
	readonly role: TBranchRole;
	readonly protection: IBranchProtectionSnapshot;
	readonly ciVerified: boolean;
	readonly ciStatus: TBranchCiStatus;
	readonly headSha: string | null;
	readonly totalCheckRuns: number;
	readonly latestCheckRunId: number | null;
	readonly latestConclusion: string | null;
	readonly latestHtmlUrl: string | null;
	readonly requiredCheckRuns: readonly IRequiredCheckRun[];
}

export interface IMainHealthReport {
	readonly repo: string;
	readonly generatedAt: string;
	readonly healthy: boolean;
	readonly discrepancies: readonly string[];
	readonly observations: readonly string[];
	readonly main: IBranchReport;
	readonly develop: IBranchReport;
}

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`)) {
			return token.slice(`--${name}=`.length);
		}
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some(
		(token) => token === `--${name}` || token.startsWith(`--${name}=`),
	);

const resolveRepository = (
	argv: readonly string[],
	env: NodeJS.ProcessEnv,
): string => {
	const repoFlag = flag(argv, 'repo');
	const ownerFlag = flag(argv, 'owner');
	if (repoFlag?.includes('/') === true) return repoFlag;
	const envRepository = env.GITHUB_REPOSITORY;
	if (ownerFlag !== undefined && repoFlag !== undefined) {
		return `${ownerFlag}/${repoFlag}`;
	}
	if (repoFlag !== undefined) {
		const owner =
			ownerFlag ??
			envRepository?.split('/')[0] ??
			DEFAULT_REPOSITORY.split('/')[0];
		return `${owner}/${repoFlag}`;
	}
	if (ownerFlag !== undefined) {
		const repo =
			envRepository?.split('/')[1] ?? DEFAULT_REPOSITORY.split('/')[1];
		return `${ownerFlag}/${repo}`;
	}
	return envRepository ?? DEFAULT_REPOSITORY;
};

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

const parseGitHubCheckRunsResponse = (
	json: unknown,
): IGitHubCheckRunsResponse => githubCheckRunsResponseSchema.parse(json);

const isPassingConclusion = (conclusion: string | null): boolean =>
	conclusion !== null && PASSING_CHECK_CONCLUSIONS.has(conclusion);

const findDeclaredBranch = (
	branches: readonly IDeclaredBranchPolicy[],
	name: string,
): IDeclaredBranchPolicy => {
	const branch = branches.find((candidate) => candidate.name === name);
	if (branch === undefined) {
		throw new Error(
			`verify-main-health: missing declared branch policy for ${name}`,
		);
	}
	return branch;
};

export const diffDeclaredProtection = (
	expected: IDeclaredBranchPolicy,
	live: IGitHubBranchProtectionResponse | null,
	verified: boolean,
): string[] => {
	if (!verified) {
		return [
			`${expected.name}: branch protection could not be verified via GitHub API`,
		];
	}
	if (!expected.protected) {
		if (live === null) return [];
		return [
			`${expected.name}: branch is protected in GitHub but declared unprotected`,
		];
	}
	if (live === null) {
		return [
			`${expected.name}: branch protection is missing in GitHub but declared protected`,
		];
	}
	const diff: string[] = [];
	const liveChecks = live.required_status_checks?.contexts ?? [];
	const expectedChecks = expected.protection.required_status_checks.contexts;
	if (
		(live.required_status_checks?.strict ?? false) !==
		expected.protection.required_status_checks.strict
	) {
		diff.push(
			`${expected.name}: required_status_checks.strict expected ${String(expected.protection.required_status_checks.strict)} but found ${String(live.required_status_checks?.strict ?? false)}`,
		);
	}
	if (live.enforce_admins.enabled !== expected.protection.enforce_admins) {
		diff.push(
			`${expected.name}: enforce_admins expected ${String(expected.protection.enforce_admins)} but found ${String(live.enforce_admins.enabled)}`,
		);
	}
	if (
		live.required_linear_history.enabled !==
		expected.protection.required_linear_history
	) {
		diff.push(
			`${expected.name}: required_linear_history expected ${String(expected.protection.required_linear_history)} but found ${String(live.required_linear_history.enabled)}`,
		);
	}
	if (
		live.allow_force_pushes.enabled !==
		expected.protection.allow_force_pushes
	) {
		diff.push(
			`${expected.name}: allow_force_pushes expected ${String(expected.protection.allow_force_pushes)} but found ${String(live.allow_force_pushes.enabled)}`,
		);
	}
	if (live.allow_deletions.enabled !== expected.protection.allow_deletions) {
		diff.push(
			`${expected.name}: allow_deletions expected ${String(expected.protection.allow_deletions)} but found ${String(live.allow_deletions.enabled)}`,
		);
	}
	for (const check of expectedChecks) {
		if (!liveChecks.includes(check)) {
			diff.push(
				`${expected.name}: missing required status check "${check}"`,
			);
		}
	}
	for (const check of liveChecks) {
		if (!expectedChecks.includes(check)) {
			diff.push(
				`${expected.name}: unexpected live status check "${check}"`,
			);
		}
	}
	return diff;
};

const buildProtectionSnapshot = (
	expected: IDeclaredBranchPolicy,
	live: IGitHubBranchProtectionResponse | null,
	verified: boolean,
): IBranchProtectionSnapshot => ({
	verified,
	protected: live !== null,
	requiredStatusChecks: {
		strict: live?.required_status_checks?.strict ?? null,
		contexts: live?.required_status_checks?.contexts ?? [],
	},
	enforceAdmins: live?.enforce_admins.enabled ?? null,
	requiredLinearHistory: live?.required_linear_history.enabled ?? null,
	allowForcePushes: live?.allow_force_pushes.enabled ?? null,
	allowDeletions: live?.allow_deletions.enabled ?? null,
	raw: live,
	diff: diffDeclaredProtection(expected, live, verified),
});

const buildRequiredCheckRuns = (
	requiredChecks: readonly string[],
	checkRuns: readonly IGitHubCheckRun[],
): IRequiredCheckRun[] =>
	requiredChecks.map((name) => {
		const live = checkRuns.find((checkRun) => checkRun.name === name);
		return {
			id: live?.id ?? null,
			name,
			status: live?.status ?? null,
			conclusion: live?.conclusion ?? null,
			htmlUrl: live?.html_url ?? null,
		};
	});

const getCiStatus = (
	requiredCheckRuns: readonly IRequiredCheckRun[],
	checkRuns: readonly IGitHubCheckRun[],
): TBranchCiStatus => {
	if (requiredCheckRuns.length > 0) {
		return requiredCheckRuns.every(
			(checkRun) =>
				checkRun.status === 'completed' &&
				isPassingConclusion(checkRun.conclusion),
		)
			? 'green'
			: 'red';
	}
	if (checkRuns.length === 0) return 'unknown';
	return checkRuns.every(
		(checkRun) =>
			checkRun.status === 'completed' &&
			isPassingConclusion(checkRun.conclusion ?? null),
	)
		? 'green'
		: 'red';
};

const fetchBranchCiReport = async (params: {
	repo: string;
	branch: string;
	role: TBranchRole;
	token: string | undefined;
	tokenExplicit: boolean;
	requiredChecks: readonly string[];
}): Promise<IBranchReport> => {
	const { repo, branch, role, token, tokenExplicit, requiredChecks } = params;
	const res = await fetch(
		`https://api.github.com/repos/${repo}/commits/${branch}/check-runs`,
		{ headers: githubHeaders(token) },
	);
	if (res.status === 401 || res.status === 403) {
		if (role === 'gate' || tokenExplicit) {
			throw new Error(
				`${branch}: latest commit check-runs are not readable with the token in use`,
			);
		}
		return {
			ref: branch,
			role,
			protection: {
				verified: false,
				protected: false,
				requiredStatusChecks: { strict: null, contexts: [] },
				enforceAdmins: null,
				requiredLinearHistory: null,
				allowForcePushes: null,
				allowDeletions: null,
				raw: null,
				diff: [],
			},
			ciVerified: false,
			ciStatus: 'unknown',
			headSha: null,
			totalCheckRuns: 0,
			latestCheckRunId: null,
			latestConclusion: null,
			latestHtmlUrl: null,
			requiredCheckRuns: buildRequiredCheckRuns(requiredChecks, []),
		};
	}
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on ${branch} check-runs: ${await res.text()}`,
		);
	}
	const payload = parseGitHubCheckRunsResponse(await res.json());
	const requiredCheckRuns = buildRequiredCheckRuns(
		requiredChecks,
		payload.check_runs,
	);
	return {
		ref: branch,
		role,
		protection: {
			verified: false,
			protected: false,
			requiredStatusChecks: { strict: null, contexts: [] },
			enforceAdmins: null,
			requiredLinearHistory: null,
			allowForcePushes: null,
			allowDeletions: null,
			raw: null,
			diff: [],
		},
		ciVerified: true,
		ciStatus: getCiStatus(requiredCheckRuns, payload.check_runs),
		headSha: payload.check_runs[0]?.head_sha ?? null,
		totalCheckRuns: payload.check_runs.length,
		latestCheckRunId: payload.check_runs[0]?.id ?? null,
		latestConclusion: payload.check_runs[0]?.conclusion ?? null,
		latestHtmlUrl: payload.check_runs[0]?.html_url ?? null,
		requiredCheckRuns,
	};
};

const mergeBranchReport = (
	ciReport: IBranchReport,
	protection: IBranchProtectionSnapshot,
): IBranchReport => ({
	...ciReport,
	protection,
});

const buildDryRunReport = (
	repo: string,
	mainPolicy: IDeclaredBranchPolicy,
	developPolicy: IDeclaredBranchPolicy,
): IMainHealthReport => ({
	repo,
	generatedAt: new Date().toISOString(),
	healthy: false,
	discrepancies: [
		'dry-run: GitHub API was not contacted; main health is unverified',
	],
	observations: [
		'dry-run: develop was not observed because GitHub API access was disabled',
	],
	main: {
		ref: 'main',
		role: 'gate',
		protection: buildProtectionSnapshot(mainPolicy, null, false),
		ciVerified: false,
		ciStatus: 'unknown',
		headSha: null,
		totalCheckRuns: 0,
		latestCheckRunId: null,
		latestConclusion: null,
		latestHtmlUrl: null,
		requiredCheckRuns: buildRequiredCheckRuns(
			mainPolicy.protection.required_status_checks.contexts,
			[],
		),
	},
	develop: {
		ref: 'develop',
		role: 'observation',
		protection: buildProtectionSnapshot(developPolicy, null, false),
		ciVerified: false,
		ciStatus: 'unknown',
		headSha: null,
		totalCheckRuns: 0,
		latestCheckRunId: null,
		latestConclusion: null,
		latestHtmlUrl: null,
		requiredCheckRuns: [],
	},
});

export const main = async (argv: readonly string[]): Promise<number> => {
	const repo = resolveRepository(argv, process.env);
	const dryRun = hasFlag(argv, 'dry-run');
	const explicitToken =
		flag(argv, 'token') ?? process.env.BRANCH_PROTECTION_TOKEN;
	const tokenExplicit =
		explicitToken !== undefined && explicitToken.length > 0;
	const token = explicitToken ?? process.env.GITHUB_TOKEN;
	const output = flag(argv, 'output');
	const configPath = flag(argv, 'config');

	const declared = await loadDeclaredBranchProtectionConfig(configPath);
	const mainPolicy = findDeclaredBranch(declared.branches, 'main');
	const developPolicy = findDeclaredBranch(declared.branches, 'develop');

	if (dryRun) {
		const report = buildDryRunReport(repo, mainPolicy, developPolicy);
		const json = JSON.stringify(report, null, 2);
		if (output !== undefined) {
			await writeFile(output, `${json}\n`, 'utf8');
		}
		out(json);
		return 0;
	}

	let mainLive: IGitHubBranchProtectionResponse | null = null;
	let mainVerified = false;
	try {
		const result = await fetchBranchProtection({
			repo,
			branch: 'main',
			token,
			tokenExplicit,
		});
		if (result.kind === 'unverified') {
			mainVerified = false;
		} else {
			mainVerified = true;
			mainLive = result.kind === 'live' ? result.data : null;
		}
	} catch (error) {
		if (!(error instanceof GitHubProtectionAuthError)) throw error;
		err(`${SCRIPT_NAME}: ${error.message}`);
		return 1;
	}

	let developLive: IGitHubBranchProtectionResponse | null = null;
	let developVerified = false;
	try {
		const result = await fetchBranchProtection({
			repo,
			branch: 'develop',
			token,
			tokenExplicit,
		});
		if (result.kind !== 'unverified') {
			developVerified = true;
			developLive = result.kind === 'live' ? result.data : null;
		}
	} catch (error) {
		if (!(error instanceof GitHubProtectionAuthError)) throw error;
	}

	const mainCi = await fetchBranchCiReport({
		repo,
		branch: 'main',
		role: 'gate',
		token,
		tokenExplicit,
		requiredChecks: mainPolicy.protection.required_status_checks.contexts,
	});
	let developCi: IBranchReport;
	try {
		developCi = await fetchBranchCiReport({
			repo,
			branch: 'develop',
			role: 'observation',
			token,
			tokenExplicit,
			requiredChecks:
				developPolicy.protection.required_status_checks.contexts,
		});
	} catch {
		developCi = {
			ref: 'develop',
			role: 'observation',
			protection: {
				verified: false,
				protected: false,
				requiredStatusChecks: { strict: null, contexts: [] },
				enforceAdmins: null,
				requiredLinearHistory: null,
				allowForcePushes: null,
				allowDeletions: null,
				raw: null,
				diff: [],
			},
			ciVerified: false,
			ciStatus: 'unknown',
			headSha: null,
			totalCheckRuns: 0,
			latestCheckRunId: null,
			latestConclusion: null,
			latestHtmlUrl: null,
			requiredCheckRuns: [],
		};
	}

	const main = mergeBranchReport(
		mainCi,
		buildProtectionSnapshot(mainPolicy, mainLive, mainVerified),
	);
	const develop = mergeBranchReport(
		developCi,
		buildProtectionSnapshot(developPolicy, developLive, developVerified),
	);

	const discrepancies = [...main.protection.diff];
	if (!main.ciVerified) {
		discrepancies.push(
			'main: latest commit check-runs could not be verified via GitHub API',
		);
	}
	if (main.ciVerified && main.ciStatus !== 'green') {
		discrepancies.push(
			`main: latest required checks are ${main.ciStatus} on ${main.headSha ?? 'unknown-sha'}`,
		);
	}

	const observations: string[] = [];
	if (!develop.protection.verified) {
		observations.push(
			'develop: branch protection could not be verified via GitHub API',
		);
	}
	if (!develop.ciVerified) {
		observations.push(
			'develop: latest commit check-runs could not be verified via GitHub API',
		);
	} else if (develop.ciStatus !== 'green') {
		observations.push(
			`develop: latest observed checks are ${develop.ciStatus} on ${develop.headSha ?? 'unknown-sha'}`,
		);
	}

	const report: IMainHealthReport = {
		repo,
		generatedAt: new Date().toISOString(),
		healthy: discrepancies.length === 0,
		discrepancies,
		observations,
		main,
		develop,
	};

	const json = JSON.stringify(report, null, 2);
	if (output !== undefined) {
		await writeFile(output, `${json}\n`, 'utf8');
	}
	out(json);

	if (report.healthy) {
		err(
			`${SCRIPT_NAME}: main is green and protected according to GitHub API`,
		);
		return 0;
	}
	err(
		`${SCRIPT_NAME}: main health drift detected — see ${output ?? 'stdout'}`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
