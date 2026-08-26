#!/usr/bin/env bun
/**
 * verify-develop-health.script.ts — v00125.
 *
 * Reads the REAL state of `develop` and `main` from the GitHub
 * API and compares it against `.github/branch-protection.ts`.
 * Produces a structured JSON report + exit code (0 = healthy,
 * 1 = drift, 2 = config error). Designed to run in a nightly CI
 * job that creates an issue on failure.
 *
 * Inputs:
 *   --repo <owner/repo>   REQUIRED. GitHub repo slug.
 *   --token <gh-token>    OPTIONAL. Falls back to GITHUB_TOKEN env.
 *   --output <path>       OPTIONAL. Write the JSON report to a
 *                          file. Useful for the dashboard.
 *   --dry-run             OPTIONAL. Print the report to stdout.
 *
 * Exit codes:
 *   0  develop + main are protected AND every required check is
 *      present in the live policy.
 *   1  at least one drift was detected.
 *   2  config / network error.
 */

import { writeFile } from 'node:fs/promises';

import {
	BRANCH_PROTECTION,
	type IBranchProtectionConfig,
} from '../../../.github/branch-protection.ts';

interface IGitHubProtection {
	readonly enforce_admins?: { enabled?: boolean } | null;
	readonly required_linear_history?: { enabled?: boolean } | null;
	readonly allow_force_pushes?: { enabled?: boolean } | null;
	readonly allow_deletion?: { enabled?: boolean } | null;
	readonly required_status_checks?: {
		readonly strict?: boolean;
		readonly contexts?: readonly string[];
	} | null;
}

interface IBranchHealth {
	readonly name: string;
	readonly protected: boolean;
	readonly enforce_admins: boolean;
	readonly required_linear_history: boolean;
	readonly allow_force_pushes: boolean;
	readonly allow_deletion: boolean;
	readonly live_required_checks: readonly string[];
	readonly missing_checks: readonly string[];
	readonly extra_checks: readonly string[];
}

interface IHealthReport {
	readonly repo: string;
	readonly generatedAt: string;
	readonly healthy: boolean;
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

const fetchProtection = async (
	repo: string,
	branch: string,
	token: string | undefined,
): Promise<IGitHubProtection | null> => {
	const url = `https://api.github.com/repos/${repo}/branches/${branch}/protection`;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (token !== undefined && token.length > 0) {
		headers.Authorization = `Bearer ${token}`;
	}
	const res = await fetch(url, { headers });
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on ${branch}: ${await res.text()}`,
		);
	}
	return (await res.json()) as IGitHubProtection;
};

const inspectBranch = (
	expected: IBranchProtectionConfig['branches'][number],
	live: IGitHubProtection | null,
): IBranchHealth => {
	const liveChecks = live?.required_status_checks?.contexts ?? [];
	const expectedSet = new Set(expected.required_checks);
	return {
		name: expected.name,
		protected: live !== null,
		enforce_admins: live?.enforce_admins?.enabled === true,
		required_linear_history:
			live?.required_linear_history?.enabled === true,
		allow_force_pushes: live?.allow_force_pushes?.enabled === false,
		allow_deletion: live?.allow_deletion?.enabled === false,
		live_required_checks: liveChecks,
		missing_checks: expected.required_checks.filter(
			(c) => !liveChecks.includes(c),
		),
		extra_checks: liveChecks.filter((c) => !expectedSet.has(c)),
	};
};

const isHealthy = (branches: readonly IBranchHealth[]): boolean =>
	branches.every(
		(b) =>
			b.protected &&
			b.enforce_admins &&
			b.required_linear_history &&
			b.allow_force_pushes &&
			b.allow_deletion &&
			b.missing_checks.length === 0 &&
			b.extra_checks.length === 0,
	);

export const main = async (argv: readonly string[]): Promise<number> => {
	const repo = flag(argv, 'repo');
	const token = flag(argv, 'token') ?? process.env.GITHUB_TOKEN;
	const output = flag(argv, 'output');
	const dryRun = hasFlag(argv, 'dry-run');

	if (repo === undefined) {
		err('verify-develop-health: --repo <owner/repo> is required');
		return 2;
	}

	const config = BRANCH_PROTECTION;
	const branches: IBranchHealth[] = [];
	for (const expected of config.branches) {
		const live = await fetchProtection(repo, expected.name, token);
		branches.push(inspectBranch(expected, live));
	}

	const report: IHealthReport = {
		repo,
		generatedAt: new Date().toISOString(),
		healthy: isHealthy(branches),
		branches,
	};

	const json = JSON.stringify(report, null, 2);
	if (output !== undefined) {
		await writeFile(output, json, 'utf8');
	}
	if (dryRun || output === undefined) {
		out(json);
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
