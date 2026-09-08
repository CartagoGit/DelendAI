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

import { REPOSITORY_SLUG } from '@delendai/core/public';

import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml';
import { repoRoot } from '../lib/monorepo-paths';

const BRANCH = 'develop';
const REQUIRED_CHECKS = ['delendai-validate'] as const;
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
			`develop required checks must be exactly ${REQUIRED_CHECKS.join(', ')}`,
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

export const compareLive = (
	declaration: IProtectionDeclaration,
	live: Record<string, unknown>,
): void => {
	if (live.protected !== true) {
		throw new Error('live develop branch is not protected');
	}
	const checks = live.required_status_checks as
		| { strict?: boolean; contexts?: string[] }
		| null
		| undefined;
	const enabled = (key: string): boolean =>
		Boolean((live[key] as { enabled?: boolean } | undefined)?.enabled);
	if (checks?.strict !== declaration.strict)
		throw new Error('live develop required_status_checks.strict differs');
	if (
		JSON.stringify([...(checks?.contexts ?? [])].sort()) !==
		JSON.stringify([...declaration.contexts].sort())
	)
		throw new Error('live develop required status checks differ');
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
			const raw = execFileSync(
				'gh',
				['api', `repos/${repo}/branches/${BRANCH}/protection`],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
			);
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
