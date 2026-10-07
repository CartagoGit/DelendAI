/**
 * discover.tool.ts — `<prefix>_discover_providers`.
 *
 * The cheapest half of the bootstrap wizard: a PARALLEL PATH probe
 * (`command -v`) for every known provider CLI (`claude, codex, copilot,
 * aider, cn, agent`). Returns `{detected, missing}` — detected CLIs with
 * their resolved path + version, missing ones with a structured install
 * hint (any `curl … | sh` installer is flagged `dangerous:true`, CRITICAL
 * I4). Effects: `spawn` (the probes). It never spawns a MODEL and never
 * writes — that is `bootstrap_providers`' job.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import { discoverProviders } from '../bootstrap';
import type { ProbeRunner } from '../healthcheck/probe';
import { DiscoverProvidersOutputSchema } from '../schemas';

export interface IDiscoverProvidersToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
}

const InputSchema = z.object({});

export const buildDiscoverProvidersRegistration = (
	options: IDiscoverProvidersToolOptions,
): IToolRegistration => ({
	id: 'discover_providers',
	tags: ['orchestrator-runner', 'lazy', 'bootstrap'],
	effects: ['spawn'],
	summary:
		'Probe the host PATH for known provider CLIs and report which are installed vs missing.',
	descriptionKey: 'delendai_orchestrator-runner_discover_providers',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_discover_providers`,
			{
				description:
					'Discover which model-provider CLIs are installed. Runs `command -v` for claude, codex, copilot, aider, cn and agent in parallel on the host PATH and returns {detected:[{id, cliPath, version, authTier}], missing:[{id, installHint:{tool, args, pipeTo?, dangerous}}]}. A missing CLI carries a structured install hint; any hint that pipes a remote script into a shell is flagged dangerous:true. Spawns subprocesses; never spends on a model and never writes.',
				inputSchema: InputSchema,
				outputSchema: DiscoverProvidersOutputSchema,
			},
			async () => {
				const result = await discoverProviders(
					options.runner,
					options.workspaceRoot,
				);
				return toolJson({
					detected: result.detected,
					missing: result.missing,
				});
			},
		);
	},
});
