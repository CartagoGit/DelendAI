#!/usr/bin/env bun

/**
 * Validate the committed develop branch-protection declaration.
 *
 * Local runs validate the declaration only. CI or an operator can pass
 * `--live` to compare the same rule with GitHub through `gh api`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The repository identity comes from its OWN module, not from
// `@delendai/core/public`. That barrel re-exports `createMcpProject`,
// so importing one string from it dragged in the MCP server runtime and
// this guard died in CI on `Cannot find module
// '@modelcontextprotocol/sdk/server/mcp.js'` — before it could check
// anything. A lint guard should not need a server to read a branch rule.
import { REPOSITORY_SLUG } from '@delendai/core/lib/contracts/constants/repository-identity.constant';
// The branch and its checks come from the generated projection of the
// canonical development policy, so this guard cannot disagree with the
// forge settings, the runtime broker, or the health verifiers. It used
// to hardcode both.
import { BRANCH_PROTECTION } from '../../../.github/branch-protection.ts';

import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml';
// Imported from the leaf `repo-root` module rather than the
// `monorepo-paths` barrel it is re-exported from. `monorepo-paths` reads
// `DEFAULT_CORE_PATHS` off `@delendai/core/public`, which transitively
// loads `@modelcontextprotocol/sdk` — so importing it here would make
// this guard unrunnable without `node_modules`, which is exactly the
// environment `develop-protection-live` runs it in. The layout
// convention is untouched: `repo-root` is part of the `tools/scripts/lib`
// path module, not a hardcoded path.
import { repoRoot } from '../lib/repo-root';

const integrationPolicy = BRANCH_PROTECTION.branches.find(
	(branch) => branch.protected && branch.name !== 'main',
);
if (integrationPolicy === undefined) {
	throw new Error(
		'branch-protection-guard: the declared policy protects no integration branch, so there is nothing to guard.',
	);
}
const BRANCH = integrationPolicy.name;
const REQUIRED_CHECKS: readonly string[] = integrationPolicy.required_checks;
const SETTINGS_PATH = join(repoRoot(), '.github/settings.yml');

export interface IProtectionDeclaration {
	readonly name: string;
	readonly strict: boolean;
	readonly contexts: readonly string[];
	readonly enforceAdmins: boolean;
	readonly linearHistory: boolean;
	readonly forcePushes: boolean;
	readonly deletions: boolean;
	readonly restrictions: null;
}

const isRecord = (
	value: YamlValue | undefined,
): value is {
	readonly [key: string]: YamlValue;
} => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireRecord = (
	value: YamlValue | undefined,
	path: string,
): { readonly [key: string]: YamlValue } => {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	return value;
};

const requireString = (value: YamlValue | undefined, path: string): string => {
	if (typeof value !== 'string' || value.length === 0)
		throw new Error(`${path} must be a non-empty string`);
	return value;
};

const requireBoolean = (
	value: YamlValue | undefined,
	path: string,
): boolean => {
	if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
	return value;
};

const requireStringArray = (
	value: YamlValue | undefined,
	path: string,
): readonly string[] => {
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== 'string')
	)
		throw new Error(`${path} must be an array of strings`);
	return value as readonly string[];
};

export const parseDeclaration = (raw: string): IProtectionDeclaration => {
	const root = requireRecord(parseWorkflowYaml(raw), 'settings');
	const branches = root.branches;
	if (!Array.isArray(branches))
		throw new Error('settings.branches must be an array');
	const branch = branches.find(
		(entry) => isRecord(entry) && entry.name === BRANCH,
	);
	const branchRecord = requireRecord(branch, 'settings.branches[develop]');
	const protection = requireRecord(
		branchRecord.protection,
		'settings.branches[develop].protection',
	);
	const checks = requireRecord(
		protection.required_status_checks,
		'settings.branches[develop].protection.required_status_checks',
	);
	const restrictions = protection.restrictions;
	if (restrictions !== null)
		throw new Error('develop protection.restrictions must be null');
	return {
		name: requireString(branchRecord.name, 'develop.name'),
		strict: requireBoolean(
			checks.strict,
			'develop.required_status_checks.strict',
		),
		contexts: requireStringArray(
			checks.contexts,
			'develop.required_status_checks.contexts',
		),
		enforceAdmins: requireBoolean(
			protection.enforce_admins,
			'develop.enforce_admins',
		),
		linearHistory: requireBoolean(
			protection.required_linear_history,
			'develop.required_linear_history',
		),
		forcePushes: requireBoolean(
			protection.allow_force_pushes,
			'develop.allow_force_pushes',
		),
		deletions: requireBoolean(
			protection.allow_deletions,
			'develop.allow_deletions',
		),
		restrictions,
	};
};

export const assertDeclaration = (
	declaration: IProtectionDeclaration,
): void => {
	if (declaration.name !== BRANCH)
		throw new Error('branch name must be develop');
	if (!declaration.strict)
		throw new Error('develop required checks must be strict');
	if (
		declaration.contexts.length !== REQUIRED_CHECKS.length ||
		!REQUIRED_CHECKS.every((check) => declaration.contexts.includes(check))
	) {
		throw new Error(
			`${BRANCH} required checks must be exactly ${REQUIRED_CHECKS.join(', ')}`,
		);
	}
	if (!declaration.enforceAdmins)
		throw new Error('develop must enforce admins');
	if (!declaration.linearHistory)
		throw new Error('develop must require linear history');
	if (declaration.forcePushes)
		throw new Error('develop must reject force pushes');
	if (declaration.deletions) throw new Error('develop must reject deletions');
};

/**
 * Compare the LIVE protection object against the declaration.
 *
 * Two things about GitHub's `/branches/{branch}/protection` payload were
 * getting this wrong, and both made the gate unpassable:
 *
 *  1. It carries NO `protected` field — that one lives on
 *     `/branches/{branch}`. Asserting `live.protected === true` here
 *     therefore failed for every branch, protected or not, and reported
 *     a correctly-protected branch as unprotected. Reaching this
 *     function at all IS the proof: the endpoint 404s when there is no
 *     rule, which `run` now reports separately.
 *  2. It OMITS `required_status_checks` entirely when no check is
 *     configured, rather than sending an empty list. Reading `strict`
 *     off `undefined` then compared `undefined` against a boolean and
 *     misreported the difference. Absent is normalised to "no checks,
 *     not strict", which is what it means.
 */
export const compareLive = (
	declaration: IProtectionDeclaration,
	live: Record<string, unknown>,
): void => {
	const raw = live.required_status_checks as
		| { strict?: boolean; contexts?: string[] }
		| null
		| undefined;
	const checks = {
		strict: raw?.strict ?? false,
		contexts: raw?.contexts ?? [],
	};
	const enabled = (key: string): boolean =>
		Boolean((live[key] as { enabled?: boolean } | undefined)?.enabled);
	if (checks.strict !== declaration.strict)
		throw new Error(
			`live ${BRANCH} required_status_checks.strict is ${checks.strict}, declared ${declaration.strict}`,
		);
	if (
		JSON.stringify([...checks.contexts].sort()) !==
		JSON.stringify([...declaration.contexts].sort())
	)
		throw new Error(
			`live ${BRANCH} required status checks are [${checks.contexts.join(', ')}], declared [${declaration.contexts.join(', ')}]`,
		);
	if (enabled('enforce_admins') !== declaration.enforceAdmins)
		throw new Error('live develop enforce_admins differs');
	if (enabled('required_linear_history') !== declaration.linearHistory)
		throw new Error('live develop required_linear_history differs');
	if (enabled('allow_force_pushes') !== declaration.forcePushes)
		throw new Error('live develop allow_force_pushes differs');
	if (enabled('allow_deletions') !== declaration.deletions)
		throw new Error('live develop allow_deletions differs');
};

export const run = (
	argv: readonly string[] = process.argv.slice(2),
): number => {
	try {
		const declaration = parseDeclaration(
			readFileSync(SETTINGS_PATH, 'utf8'),
		);
		assertDeclaration(declaration);
		if (argv.includes('--live')) {
			const repo = process.env.GITHUB_REPOSITORY ?? REPOSITORY_SLUG;
			let raw: string;
			try {
				raw = execFileSync(
					'gh',
					['api', `repos/${repo}/branches/${BRANCH}/protection`],
					{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
				);
			} catch (error) {
				// A 404 here means one of two very different things, and
				// saying which is the whole value of this guard: GitHub
				// answers "Branch not protected" when no rule exists, and
				// "Not Found" when the branch or the token's access is
				// missing. Reporting the second as the first would send
				// someone to configure a rule that already exists.
				const detail =
					error instanceof Error &&
					'stderr' in error &&
					typeof (error as { stderr?: unknown }).stderr === 'string'
						? (error as { stderr: string }).stderr
						: '';
				throw new Error(
					detail.includes('Branch not protected')
						? `live ${BRANCH} has no branch protection rule at all`
						: `could not read live protection for ${BRANCH}; nothing was concluded from the failure: ${detail.trim() || 'unknown error'}`,
				);
			}
			compareLive(
				declaration,
				JSON.parse(raw) as Record<string, unknown>,
			);
		}
		console.log(
			`branch-protection-guard: ${argv.includes('--live') ? 'live protection' : 'declaration'} for ${BRANCH} is valid${argv.includes('--live') ? ' and matches GitHub' : ''} ✓`,
		);
		return 0;
	} catch (error) {
		console.error(
			`branch-protection-guard: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
};

if (import.meta.main) process.exit(run());
