#!/usr/bin/env bun
/**
 * verify-branch-protection.script.ts — c00130 (AUD-P0-001).
 *
 * Diff-fetches the real GitHub branch protection state for
 * `develop` + `main` against `.github/branch-protection.yml`
 * and exits non-zero when they diverge. Designed to run in
 * the `quality-gate` CI job so a missed protection setting
 * blocks the merge.
 *
 * Inputs (CLI flags):
 *
 *   --owner <owner>          OPTIONAL. GitHub owner/org.
 *   --repo <repo|owner/repo> OPTIONAL. Repo name or full slug.
 *                            Defaults to the current repository.
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

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	fetchBranchProtection,
	GitHubProtectionAuthError,
	type IProtectionFetchResult,
	type IGitHubBranchProtectionResponse,
	reportUnverifiedBranches,
} from './lib/github-protection.lib.ts';
import { parseWorkflowYaml } from './workflow-yaml.ts';
import { REPOSITORY_SLUG } from '@mcp-vertex/core/public';

const SCRIPT_NAME = 'verify-branch-protection';
const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const DEFAULT_CONFIG_PATH = join(REPO_ROOT, '.github/branch-protection.yml');
const DEFAULT_REPOSITORY = REPOSITORY_SLUG;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const expectString = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${path} must be a non-empty string`);
	}
	return value;
};

const expectBoolean = (value: unknown, path: string): boolean => {
	if (typeof value !== 'boolean') {
		throw new Error(`${path} must be a boolean`);
	}
	return value;
};

const expectNull = (value: unknown, path: string): null => {
	if (value !== null) {
		throw new Error(`${path} must be null`);
	}
	return null;
};

const expectStringArray = (value: unknown, path: string): readonly string[] => {
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== 'string')
	) {
		throw new Error(`${path} must be an array of strings`);
	}
	return value;
};

export interface IDeclaredRequiredStatusChecks {
	readonly strict: boolean;
	readonly contexts: readonly string[];
}

export interface IDeclaredBranchRule {
	readonly required_status_checks: IDeclaredRequiredStatusChecks;
	readonly enforce_admins: boolean;
	readonly required_linear_history: boolean;
	readonly allow_force_pushes: boolean;
	readonly allow_deletions: boolean;
	readonly restrictions: null;
}

export interface IDeclaredBranchPolicy {
	readonly name: string;
	readonly protected: boolean;
	readonly protection: IDeclaredBranchRule;
}

export interface IDeclaredBranchProtectionConfig {
	readonly version: 1;
	readonly branches: readonly IDeclaredBranchPolicy[];
}

const parseDeclaredBranch = (
	value: unknown,
	index: number,
): IDeclaredBranchPolicy => {
	if (!isRecord(value)) {
		throw new Error(`branches[${index}] must be an object`);
	}
	const protection = value.protection;
	if (!isRecord(protection)) {
		throw new Error(`branches[${index}].protection must be an object`);
	}
	const requiredStatusChecks = protection.required_status_checks;
	if (!isRecord(requiredStatusChecks)) {
		throw new Error(
			`branches[${index}].protection.required_status_checks must be an object`,
		);
	}
	return {
		name: expectString(value.name, `branches[${index}].name`),
		protected:
			value.protected === undefined
				? true
				: expectBoolean(
						value.protected,
						`branches[${index}].protected`,
					),
		protection: {
			required_status_checks: {
				strict: expectBoolean(
					requiredStatusChecks.strict,
					`branches[${index}].protection.required_status_checks.strict`,
				),
				contexts: expectStringArray(
					requiredStatusChecks.contexts,
					`branches[${index}].protection.required_status_checks.contexts`,
				),
			},
			enforce_admins: expectBoolean(
				protection.enforce_admins,
				`branches[${index}].protection.enforce_admins`,
			),
			required_linear_history: expectBoolean(
				protection.required_linear_history,
				`branches[${index}].protection.required_linear_history`,
			),
			allow_force_pushes: expectBoolean(
				protection.allow_force_pushes,
				`branches[${index}].protection.allow_force_pushes`,
			),
			allow_deletions: expectBoolean(
				protection.allow_deletions,
				`branches[${index}].protection.allow_deletions`,
			),
			restrictions: expectNull(
				protection.restrictions,
				`branches[${index}].protection.restrictions`,
			),
		},
	};
};

export const parseDeclaredBranchProtectionConfig = (
	raw: string,
): IDeclaredBranchProtectionConfig => {
	const parsed = parseWorkflowYaml(raw);
	if (!isRecord(parsed)) {
		throw new Error('branch protection config must be a root object');
	}
	if (parsed.version !== 1) {
		throw new Error(
			`unsupported config version ${String(parsed.version ?? 'undefined')}`,
		);
	}
	if (!Array.isArray(parsed.branches)) {
		throw new Error('branches must be an array');
	}
	return {
		version: 1,
		branches: parsed.branches.map((branch, index) =>
			parseDeclaredBranch(branch, index),
		),
	};
};

export const loadDeclaredBranchProtectionConfig = async (
	configPath = DEFAULT_CONFIG_PATH,
): Promise<IDeclaredBranchProtectionConfig> =>
	parseDeclaredBranchProtectionConfig(await readFile(configPath, 'utf8'));

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

const formatDeclaredChecks = (contexts: readonly string[]): string =>
	contexts.length === 0 ? '(none)' : contexts.join(', ');

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
	expected: IDeclaredBranchPolicy,
	live: IGitHubBranchProtectionResponse | null,
): readonly IDrift[] => {
	if (live === null) {
		if (!expected.protected) return [];
		return [
			{
				branch: expected.name,
				kind: 'MISSING',
				detail: 'branch has no protection rule on GitHub',
			},
		];
	}
	if (!expected.protected) {
		return [
			{
				branch: expected.name,
				kind: 'MISSING',
				detail: 'branch has a protection rule on GitHub but none is declared',
			},
		];
	}
	const drifts: IDrift[] = [];
	const requiredStatusChecks = live.required_status_checks;
	const expectedProtection = expected.protection;
	if (
		(requiredStatusChecks?.strict ?? false) !==
		expectedProtection.required_status_checks.strict
	) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail:
				`required_status_checks.strict must be ${expectedProtection.required_status_checks.strict} ` +
				`(got ${String(requiredStatusChecks?.strict)})`,
		});
	}
	if (live.enforce_admins.enabled !== expectedProtection.enforce_admins) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `enforce_admins must be ${expectedProtection.enforce_admins} (got ${live.enforce_admins.enabled})`,
		});
	}
	if (
		live.required_linear_history.enabled !==
		expectedProtection.required_linear_history
	) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `required_linear_history must be ${expectedProtection.required_linear_history} (got ${live.required_linear_history.enabled})`,
		});
	}
	if (
		live.allow_force_pushes.enabled !==
		expectedProtection.allow_force_pushes
	) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_force_pushes must be ${expectedProtection.allow_force_pushes} (got ${live.allow_force_pushes.enabled})`,
		});
	}
	if (live.allow_deletions.enabled !== expectedProtection.allow_deletions) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `allow_deletions must be ${expectedProtection.allow_deletions} (got ${live.allow_deletions.enabled})`,
		});
	}
	const declaredChecks = expectedProtection.required_status_checks.contexts;
	const liveChecks = [...new Set(requiredStatusChecks?.contexts ?? [])];
	const expectedChecks = new Set(declaredChecks);
	const missing = declaredChecks.filter((c) => !liveChecks.includes(c));
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
	const liveRestrictions = live as { restrictions?: unknown };
	if (
		Object.hasOwn(liveRestrictions, 'restrictions') &&
		liveRestrictions.restrictions !== expectedProtection.restrictions
	) {
		drifts.push({
			branch: expected.name,
			kind: 'BOOL_DRIFT',
			detail: `restrictions must be ${String(expectedProtection.restrictions)} (got ${String(liveRestrictions.restrictions)})`,
		});
	}
	return drifts;
};

export interface IRunDependencies {
	readonly configPath?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly out?: (msg: string) => void;
	readonly err?: (msg: string) => void;
	readonly fetchProtection?: (
		params: Parameters<typeof fetchBranchProtection>[0],
	) => Promise<IProtectionFetchResult>;
	readonly reportUnverified?: typeof reportUnverifiedBranches;
	readonly loadConfig?: (
		configPath: string,
	) => Promise<IDeclaredBranchProtectionConfig>;
}

export const run = async (
	argv: readonly string[],
	deps: IRunDependencies = {},
): Promise<number> => {
	const outWriter = deps.out ?? out;
	const errWriter = deps.err ?? err;
	const env = deps.env ?? process.env;
	const configPath = deps.configPath ?? DEFAULT_CONFIG_PATH;
	const fetchProtection = deps.fetchProtection ?? fetchBranchProtection;
	const reportUnverified = deps.reportUnverified ?? reportUnverifiedBranches;
	const loadConfig = deps.loadConfig ?? loadDeclaredBranchProtectionConfig;
	const repo = resolveRepository(argv, env);
	const dryRun = hasFlag(argv, 'dry-run');
	const explicitToken = flag(argv, 'token') ?? env.BRANCH_PROTECTION_TOKEN;
	const tokenExplicit =
		explicitToken !== undefined && explicitToken.length > 0;
	const token = explicitToken ?? env.GITHUB_TOKEN;

	let config: IDeclaredBranchProtectionConfig;
	try {
		config = await loadConfig(configPath);
	} catch (error) {
		errWriter(
			`verify-branch-protection: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 2;
	}

	if (dryRun) {
		outWriter(
			`verify-branch-protection: dry-run; would verify ${config.branches.length} branch(es)`,
		);
		for (const b of config.branches) {
			outWriter(
				`  - ${b.name} — strict=${b.protection.required_status_checks.strict}, checks=${formatDeclaredChecks(b.protection.required_status_checks.contexts)}, enforce_admins=${b.protection.enforce_admins}, required_linear_history=${b.protection.required_linear_history}, allow_force_pushes=${b.protection.allow_force_pushes}, allow_deletions=${b.protection.allow_deletions}`,
			);
		}
		return 0;
	}

	const allDrifts: IDrift[] = [];
	const unverifiable: string[] = [];
	let readCount = 0;
	const branchCache = new Map<string, IProtectionFetchResult>();
	for (const expected of config.branches) {
		try {
			let result = branchCache.get(expected.name);
			if (result === undefined) {
				result = await fetchProtection({
					repo,
					branch: expected.name,
					token,
					tokenExplicit,
				});
				branchCache.set(expected.name, result);
			}
			if (result.kind === 'unverified') {
				unverifiable.push(expected.name);
				continue;
			}
			readCount += 1;
			const live = result.kind === 'live' ? result.data : null;
			allDrifts.push(...diffBranch(expected, live));
		} catch (error) {
			if (error instanceof GitHubProtectionAuthError) {
				errWriter(`verify-branch-protection: ${error.message}`);
				return 1;
			}
			errWriter(
				`verify-branch-protection: failed to read ${expected.name} on ${repo} — ${error instanceof Error ? error.message : String(error)}`,
			);
			return 1;
		}
	}

	if (unverifiable.length > 0) {
		await reportUnverified(SCRIPT_NAME, unverifiable);
	}

	// A branch that couldn't be read never masks one that could — a
	// readable branch with real drift always fails, however many other
	// branches were unreadable. Only the total absence of any reading
	// collapses to `unverified`.
	if (readCount === 0) {
		outWriter(
			'verify-branch-protection: no branch could be read with the token in ' +
				'use — nothing verified, nothing asserted.',
		);
		return 0;
	}
	if (allDrifts.length === 0) {
		outWriter(
			`verify-branch-protection: ${readCount} of ${config.branches.length} branch(es) read match the declared policy ✓`,
		);
		return 0;
	}
	for (const d of allDrifts) {
		errWriter(
			`verify-branch-protection: ${d.branch} ${d.kind} — ${d.detail}`,
		);
	}
	errWriter(
		`verify-branch-protection: ${allDrifts.length} drift(s) — see docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`,
	);
	return 1;
};

export const main = async (argv: readonly string[]): Promise<number> =>
	run(argv);

if (import.meta.main) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
