#!/usr/bin/env bun
/**
 * land.script.ts — runs one `land` pass against GitHub from a checkout.
 *
 * Usage: bun tools/scripts/forge/land.script.ts
 * Env: GITHUB_REPOSITORY (`owner/name`), GH_TOKEN (the identity's token),
 * LAND_WATCHDOG (`1` on the scheduled pass: any action it takes fails the run).
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
	let development: ReturnType<typeof readDevelopmentConfig>;
	try {
		development = readDevelopmentConfig();
	} catch (error) {
		console.error(
			`land: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 2;
	}
	const policy = resolveDevelopmentPolicy(development);
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
	const forge = createGithubLandForge({
		slug,
		integration: config.integrationBranch,
		mergeMethod: config.mergeMethod,
		run: createForgeCliRunner(root),
	});
	const report = await landPass({
		forge,
		git: createLandGit({ root, remote: 'origin' }),
		config,
	});
	for (const line of report.actions) console.log(`land: ${line}`);
	// Every open pull request, every pass: "0 merged" is never silent.
	for (const [number, reason] of [...report.reasons].sort(
		([a], [b]) => a - b,
	))
		console.log(`land: #${String(number)} ${reason}`);
	console.log(
		`land: ${String(report.mergedCount)} merged${report.mergedPRs.length > 0 ? ` (${report.mergedPRs.map((n) => `#${String(n)}`).join(', ')})` : ''}; tip ${report.tipSha.slice(0, 12)}`,
	);
	// The watchdog runs the same pass on a timer: work it finds is work no
	// event started, so it fails the run and the workflow files the evidence.
	if (process.env.LAND_WATCHDOG === '1' && report.actions.length > 0) {
		console.error(
			`land: the watchdog acted ${String(report.actions.length)} time(s): an event was missed.`,
		);
		return 1;
	}
	return 0;
};

process.exit(await main());
