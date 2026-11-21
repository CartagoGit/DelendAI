#!/usr/bin/env bun
/**
 * land-repair.script.ts — runs one repair pass against GitHub from a
 * checkout: when the integration branch's latest completed CI run is red,
 * its culprit merge is reverted as a repair pull request, and the original
 * work is re-opened. Otherwise it does nothing, so it is safe to run on
 * every completed run.
 *
 * Usage: bun tools/scripts/forge/land-repair.script.ts
 * Env: GITHUB_REPOSITORY (`owner/name`), GH_TOKEN (the identity's token).
 * Does nothing unless the policy's `development.integration.engine` is `land`.
 */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	runIntegrationRepair,
	type IIntegrationPassInput,
} from '@delendai/integration/public';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { readDevelopmentConfig } from './land-policy';

/** The repair pass as this script runs it, over the ports a spec may replace. */
export const runLandRepairScript = async (
	replace: Partial<IIntegrationPassInput> = {},
): Promise<number> => {
	const root = replace.root ?? process.cwd();
	let policy = replace.policy;
	if (policy === undefined) {
		try {
			policy = resolveDevelopmentPolicy(readDevelopmentConfig());
		} catch (error) {
			console.error(
				`land-repair: ${error instanceof Error ? error.message : String(error)}`,
			);
			return 2;
		}
	}
	return runIntegrationRepair({
		root,
		policy,
		env: process.env,
		runGh: createForgeCliRunner(root),
		log: (line) => console.log(line),
		error: (line) => console.error(line),
		...replace,
	});
};

if (import.meta.main) process.exit(await runLandRepairScript());
