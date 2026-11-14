#!/usr/bin/env bun
/**
 * land.script.ts — runs one `land` pass against GitHub from a checkout.
 *
 * Usage: bun tools/scripts/forge/land.script.ts
 * Env: GITHUB_REPOSITORY (`owner/name`), GH_TOKEN (the identity's token),
 * LAND_WATCHDOG (`1` on the scheduled pass: any action it takes fails the run).
 *
 * The pass is the integration plugin's, the one `delendai integration pass`
 * runs: this only reads this repository's policy and gives it the forge CLI.
 * Does nothing unless the policy's `development.integration.engine` is
 * `land`.
 */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	runIntegrationPass,
	type IIntegrationPassInput,
} from '@delendai/integration/public';

import { createForgeCliRunner } from '../host/forge-seam.service';
import { readDevelopmentConfig } from './land-policy';

/** The pass as this script runs it, over the ports a spec may replace. */
export const runLandScript = async (
	replace: Partial<IIntegrationPassInput> = {},
): Promise<number> => {
	const root = replace.root ?? process.cwd();
	let policy = replace.policy;
	if (policy === undefined) {
		try {
			policy = resolveDevelopmentPolicy(readDevelopmentConfig());
		} catch (error) {
			console.error(
				`land: ${error instanceof Error ? error.message : String(error)}`,
			);
			return 2;
		}
	}
	return runIntegrationPass({
		root,
		policy,
		env: process.env,
		runGh: createForgeCliRunner(root),
		log: (line) => console.log(line),
		error: (line) => console.error(line),
		...replace,
	});
};

if (import.meta.main) process.exit(await runLandScript());
