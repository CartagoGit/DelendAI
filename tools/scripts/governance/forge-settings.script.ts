#!/usr/bin/env bun

/**
 * forge-settings.script.ts — writes, or checks, the committed forge
 * governance files as a projection of the canonical development policy.
 *
 *   bun tools/scripts/governance/forge-settings.script.ts          # check
 *   bun tools/scripts/governance/forge-settings.script.ts --write  # regenerate
 *
 * `--check` (the default, and what CI runs) fails when a committed file
 * no longer matches what the policy would generate. That is the whole
 * point: these documents used to be hand-edited and drifted apart from
 * each other and from the live repository, so the only durable fix is to
 * make divergence a build failure rather than a discovery.
 *
 * Regeneration is the remedy the failure names. Nobody should be editing
 * the projection — they should be editing the policy.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { stringify } from 'yaml';

import {
	resolveDevelopmentPolicy,
	validateDevelopmentPolicy,
} from '@delendai/core/public';

import { repoRoot } from '../lib/monorepo-paths';
import {
	branchProtectionDocument,
	branchProtectionModule,
	settingsDocument,
} from './forge-settings.lib';

const HEADER = [
	'# GENERATED — do not edit.',
	'#',
	'# Projection of the canonical development policy in',
	'# `delendai.config.json`. Change the policy, then run:',
	'#   bun tools/scripts/governance/forge-settings.script.ts --write',
	'',
].join('\n');

interface ITarget {
	readonly path: string;
	readonly body: string;
}

const render = (document: unknown): string =>
	`${HEADER}${stringify(document, { indent: 4, lineWidth: 0 })}`;

const buildTargets = (root: string): readonly ITarget[] => {
	const configPath = join(root, 'delendai.config.json');
	const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
		development?: Record<string, unknown>;
		agentWorktree?: boolean;
		plugins?: Record<string, { options?: Record<string, unknown> }>;
	};

	const policy = resolveDevelopmentPolicy({
		...(config.development !== undefined
			? { development: config.development }
			: {}),
		legacy: {
			...(config.agentWorktree !== undefined
				? { agentWorktree: config.agentWorktree }
				: {}),
			...(config.plugins?.['commit-policy']?.options !== undefined
				? {
						commitPolicyOptions:
							config.plugins['commit-policy'].options,
					}
				: {}),
		},
	});

	// A projection of an incoherent policy would be an incoherent
	// projection. Refuse rather than emit something nobody asked for.
	const violations = validateDevelopmentPolicy(policy);
	if (violations.length > 0) {
		const detail = violations
			.map(
				(v) =>
					`  - [${v.rule}] ${v.path}: ${v.message}\n    ${v.remedy}`,
			)
			.join('\n');
		throw new Error(
			`The development policy cannot be honoured, so no governance can be derived from it:\n${detail}`,
		);
	}

	return [
		{
			path: join(root, '.github/settings.yml'),
			body: render(settingsDocument(policy)),
		},
		{
			path: join(root, '.github/branch-protection.yml'),
			body: render(branchProtectionDocument(policy)),
		},
		{
			path: join(root, '.github/branch-protection.ts'),
			body: branchProtectionModule(policy),
		},
	];
};

const readOrEmpty = (path: string): string => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return '';
	}
};

const main = (): void => {
	const write = process.argv.includes('--write');
	const targets = buildTargets(repoRoot());

	if (write) {
		for (const target of targets) {
			writeFileSync(target.path, target.body, 'utf8');
			console.log(`wrote ${target.path}`);
		}
		return;
	}

	const drifted = targets.filter(
		(target) => readOrEmpty(target.path) !== target.body,
	);
	if (drifted.length === 0) {
		console.log(
			`✓ forge governance matches the development policy (${targets.length} file(s)).`,
		);
		return;
	}

	for (const target of drifted) {
		console.error(`✗ ${target.path} no longer matches the policy.`);
	}
	console.error(
		'\nThese files are generated. Edit the `development` policy in delendai.config.json,\nthen run: bun tools/scripts/governance/forge-settings.script.ts --write',
	);
	process.exitCode = 1;
};

main();
