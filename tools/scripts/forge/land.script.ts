#!/usr/bin/env bun
/**
 * land.script.ts — runs one `land` pass against GitHub from a checkout.
 *
 * Usage: bun tools/scripts/forge/land.script.ts
 * Env: GITHUB_REPOSITORY (`owner/name`), DELENDAI_INTEGRATION_ENGINE.
 *
 * Does nothing unless the project's engine is `land`: until the queue is
 * retired both must never run, and the workflow checks the same switch.
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { ownedNamespaces, parseJsonc } from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { createGithubLandForge } from './land-forge.github';
import { createLandGit } from './land-git';
import { landPass } from './land';

/** The project's `development` block, `{}` when the config is absent or invalid. */
const readDevelopmentConfig = (): {
	readonly development?: Record<string, unknown>;
} => {
	try {
		const { value, errors } = parseJsonc(
			readFileSync('delendai.config.json', 'utf8'),
		);
		const development = (value as Record<string, unknown>).development;
		return errors.length > 0 ||
			development === null ||
			typeof development !== 'object'
			? {}
			: { development: development as Record<string, unknown> };
	} catch {
		return {};
	}
};

const main = async (): Promise<number> => {
	if (process.env.DELENDAI_INTEGRATION_ENGINE !== 'land') {
		console.log(
			'land: the integration engine is not `land`; nothing to do.',
		);
		return 0;
	}
	const slug = process.env.GITHUB_REPOSITORY;
	if (slug === undefined) {
		console.error('land: GITHUB_REPOSITORY is not set.');
		return 2;
	}
	const root = process.cwd();
	const policy = resolveDevelopmentPolicy(readDevelopmentConfig());
	const namespace = ownedNamespaces(policy.branches)[0] ?? '';
	const report = await landPass({
		forge: createGithubLandForge({
			slug,
			integration: policy.branches.integration,
			run: createForgeCliRunner(root),
		}),
		git: createLandGit({ root, remote: 'origin' }),
		batchPrefix: namespace === '' ? 'queue/' : `${namespace}/queue/`,
	});
	for (const line of report.actions) console.log(`land: ${line}`);
	const output = process.env.GITHUB_OUTPUT;
	if (output !== undefined) {
		const merged = report.actions.some((line) => / merged /u.test(line));
		appendFileSync(output, `merged=${String(merged)}\n`);
	}
	return 0;
};

process.exit(await main());
