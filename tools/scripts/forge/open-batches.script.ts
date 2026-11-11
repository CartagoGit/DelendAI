#!/usr/bin/env bun
/**
 * open-batches.script.ts — the host's side of `land`: the same pass, in the
 * `open-batches` role, with this machine's own credentials.
 *
 *   bun tools/scripts/forge/open-batches.script.ts
 *
 * land in CI runs as a workflow token, and the forge builds nothing that
 * token pushes. Where the policy names the host as the batch opener
 * (`development.integration.batchOpener: host`), this pass reads the same
 * forge, makes the same readiness and grouping decisions, and for each
 * overlapping ready group builds the batch (tip plus members, derived files
 * regenerated once) and opens its pull request: its CI runs once for the
 * whole group, and land merges the members when it is green. It never
 * merges (refused by its role), and it builds in a throwaway clone, never
 * in this one.
 */
import { execFileSync } from 'node:child_process';

import {
	createGithubLandForge,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { forgeSlugOf } from '../host/workspace-forge-slug.helper';
import { createLandGit } from './land-git';
import { landPolicy } from './land-policy';
import { throwawayClone } from './land-rehearsal-clone';
import { zoneOfCheck } from './section-health';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

const main = async (): Promise<number> => {
	const root = process.cwd();
	const resolved = landPolicy();
	if ('stop' in resolved) {
		console.log(`open-batches: ${resolved.stop}`);
		return resolved.code;
	}
	const { policy } = resolved;
	if (policy.integration.batchOpener !== 'host') {
		console.log(
			'open-batches: the policy does not name the host as the batch opener; nothing to do.',
		);
		return 0;
	}
	const origin = git(root, ['remote', 'get-url', 'origin']);
	const slug = forgeSlugOf(origin);
	if (slug === undefined) {
		console.error(`open-batches: ${origin} is not a forge this reads.`);
		return 2;
	}
	const config = landConfigFromPolicy(policy, {
		sectionOfCheck: zoneOfCheck,
	});
	// The batch is built and pushed from a clone of its own, whose remote is
	// the forge: nothing lands in this clone, and the push is this
	// machine's, so the forge builds it.
	const clone = throwawayClone(root, []);
	try {
		git(clone.dir, ['remote', 'set-url', 'origin', origin]);
		const report = await landPass({
			forge: createGithubLandForge({
				slug,
				integration: config.integrationBranch,
				mergeMethod: config.mergeMethod,
				run: createForgeCliRunner(root),
			}),
			git: createLandGit({
				root: clone.dir,
				remote: 'origin',
				dependenciesFrom: root,
			}),
			config,
			role: 'open-batches',
		});
		for (const line of report.actions) console.log(`open-batches: ${line}`);
		for (const [number, reason] of [...report.reasons].sort(
			([a], [b]) => a - b,
		))
			console.log(`open-batches: #${String(number)} ${reason}`);
		return 0;
	} finally {
		clone.dispose();
	}
};

if (import.meta.main) process.exit(await main());
