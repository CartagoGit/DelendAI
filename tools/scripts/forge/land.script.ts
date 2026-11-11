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
	followUpWorkflows,
	integrationProtocolRefusal,
	LAND_WORKFLOW_NAME,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { readWorkflowTriggers } from './land-follow-ups';
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
	if (report.mergedCount === 0) return 0;
	// Its merges started nothing: start what a push would have, the next
	// pass among them, so nothing waits for the timer.
	const followUps = followUpWorkflows(
		readWorkflowTriggers('.github/workflows', config.integrationBranch),
		LAND_WORKFLOW_NAME,
	);
	for (const workflow of followUps.dispatch) {
		const started = await forge
			.dispatchWorkflow(workflow, config.integrationBranch)
			.catch(() => false);
		console.log(
			`land: ${started ? 'started' : 'could NOT start'} ${workflow} on ${config.integrationBranch}`,
		);
	}
	for (const workflow of followUps.unreachable)
		console.log(
			`land: ${workflow} runs on a push to ${config.integrationBranch} but cannot be started on request, so a merge by land skips it; give it workflow_dispatch.`,
		);
	return 0;
};

process.exit(await main());
