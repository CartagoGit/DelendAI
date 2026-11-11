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
	LAND_WORKFLOW_NAME,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { readWorkflowTriggers } from './land-follow-ups';
import { createLandGit } from './land-git';
import { landPolicy } from './land-policy';
import { zoneOfCheck } from './section-health';

const main = async (): Promise<number> => {
	const slug = process.env.GITHUB_REPOSITORY;
	if (slug === undefined) {
		console.error('land: GITHUB_REPOSITORY is not set.');
		return 2;
	}
	const root = process.cwd();
	const resolved = landPolicy();
	if ('stop' in resolved) {
		(resolved.code === 0 ? console.log : console.error)(
			`land: ${resolved.stop}`,
		);
		return resolved.code;
	}
	const { policy } = resolved;
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
