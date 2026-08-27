#!/usr/bin/env bun
/**
 * verify-branch-protection.script.ts — c00130 (AUD-P0-001).
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
 *   --token <gh-token>       OPTIONAL. Auth token. Falls back
 *                             to `GITHUB_TOKEN` env. Without a
 *                             token, public repos still work but
 *                             checks are limited.
 *   --dry-run                OPTIONAL. Print the policy and exit 0
 *                             without contacting GitHub. Useful
 *                             for local development.
 *
 * Exit codes:
 *   0 — every declared branch has the expected checks.
 *   1 — at least one branch diverges from the declared policy.
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

interface IGitHubBranchProtectionResponse {
	readonly enforce_admins?: { enabled?: boolean } | null;
	readonly required_linear_history?: { enabled?: boolean } | null;
	readonly allow_force_pushes?: { enabled?: boolean } | null;
	readonly allow_deletion?: { enabled?: boolean } | null;
	readonly required_status_checks?: {
		readonly strict?: boolean;
		readonly contexts?: readonly string[];
	} | null;
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
 * Fetch the live branch protection from GitHub. Returns `null`
 * when the branch is unprotected (404 on the protection endpoint).
 */
const fetchGitHubProtection = async (
	repo: string,
	branch: string,
	token: string | undefined,
): Promise<IGitHubBranchProtectionResponse | null> => {
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
	// Reading branch protection needs repo-admin scope, which the workflow
	// GITHUB_TOKEN does not have and cannot be granted (`administration` is
	// not a valid workflow permission). A token that cannot see the setting
	// cannot testify that it is wrong, so say so and stop rather than
	// reporting a violation the run never observed.
	if (res.status === 401 || res.status === 403) {
		throw new UnverifiableProtectionError(branch);
	}
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on ${branch}: ${await res.text()}`,
		);
	}
	return (await res.json()) as IGitHubBranchProtectionResponse;
};

/**
 * Raised when the API refuses to disclose a branch's protection to the
 * token in hand. Distinct from a policy violation so the caller can
 * report "not verified" instead of "not protected".
 */
export class UnverifiableProtectionError extends Error {
	readonly branch: string;

	constructor(branch: string) {
		super(
			`branch protection for "${branch}" is not readable with the token in use — ` +
				'supply a personal access token with repo-admin scope (for example as ' +
				'a BRANCH_PROTECTION_TOKEN secret passed via --token) to verify it.',
		);
		this.name = 'UnverifiableProtectionError';
		this.branch = branch;
	}
}

interface IDrift {
	readonly branch: string;
	readonly kind: 'MISSING' | 'CHECK_DRIFT' | 'BOOL_DRIFT';
	readonly detail: string;
}

/**
 * Compute the drift between declared policy and live GitHub
 * state. Returns an empty array when the branch matches.
 */
const diffBranch = (
	expected: IBranchProtectionConfig['branches'][number],
	live: IGitHubBranchProtectionResponse | null,
): readonly IDrift[] => {
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
	if (live.enforce_admins?.enabled !== true) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `enforce_admins must be true (got ${live.enforce_admins?.enabled})`,
		});
	}
	if (live.required_linear_history?.enabled !== true) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `required_linear_history must be true (got ${live.required_linear_history?.enabled})`,
		});
	}
	if (live.allow_force_pushes?.enabled !== false) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_force_pushes must be false (got ${live.allow_force_pushes?.enabled})`,
		});
	}
	if (live.allow_deletion?.enabled !== false) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_deletion must be false (got ${live.allow_deletion?.enabled})`,
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
	const token = flag(argv, 'token') ?? process.env.GITHUB_TOKEN;

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
				`  - ${b.name} — checks=${b.required_checks.length}, enforce_admins=${config.defaults.enforce_admins}`,
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
	for (const expected of config.branches) {
		try {
			const live = await fetchGitHubProtection(
				repo,
				expected.name,
				token,
			);
			allDrifts.push(...diffBranch(expected, live));
		} catch (error) {
			if (!(error instanceof UnverifiableProtectionError)) throw error;
			unverifiable.push(expected.name);
			out(`verify-branch-protection: ${error.message}`);
		}
	}
	if (unverifiable.length === config.branches.length) {
		out(
			'verify-branch-protection: no branch could be read with the token in ' +
				'use — nothing verified, nothing asserted.',
		);
		return 0;
	}
	if (allDrifts.length === 0) {
		out(
			`verify-branch-protection: ${config.branches.length} branch(es) match the declared policy ✓`,
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
