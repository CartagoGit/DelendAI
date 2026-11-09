#!/usr/bin/env bun
/**
 * land.script.ts — runs one `land` pass against GitHub from a checkout.
 *
 * Usage: bun tools/scripts/forge/land.script.ts
 * Env: GITHUB_REPOSITORY (`owner/name`).
 *
 * Does nothing unless the policy's `development.integration.engine` is
 * `land`, and refuses when the repository records a newer integration
 * protocol than this code speaks.
 */
import {
	createGithubLandForge,
	integrationProtocolRefusal,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { createLandGit } from './land-git';
import { readDevelopmentConfig } from './land-policy';
import { zoneOfCheck } from './section-health';

const main = async (): Promise<number> => {
	const slug = process.env.GITHUB_REPOSITORY;
	if (slug === undefined) {
		console.error('land: GITHUB_REPOSITORY is not set.');
		return 2;
	}
	const root = process.cwd();
	const policy = resolveDevelopmentPolicy(readDevelopmentConfig());
	if (policy.integration.engine !== 'land') {
		console.log(
			"land: the policy's integration engine is not `land`; nothing to do.",
		);
		return 0;
	}
	const stale = integrationProtocolRefusal(policy.integration.protocol);
	if (stale !== undefined) {
		console.error(`land: ${stale.reason} ${stale.remedy}`);
		return 2;
	}
	// This repository's wiring: its CI sections name the checks `tests: <zone>`.
	const config = landConfigFromPolicy(policy, {
		sectionOfCheck: zoneOfCheck,
	});
	const report = await landPass({
		forge: createGithubLandForge({
			slug,
			integration: config.integrationBranch,
			mergeMethod: config.mergeMethod,
			run: createForgeCliRunner(root),
		}),
		git: createLandGit({ root, remote: 'origin' }),
		config,
	});
	for (const line of report.actions) console.log(`land: ${line}`);
	return 0;
};

process.exit(await main());
