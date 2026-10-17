/**
 * discover.tool.ts — `<prefix>_discover_providers`.
 *
 * The cheapest half of the bootstrap wizard: a PARALLEL PATH probe
 * (`command -v`) for every known provider CLI (`claude, codex, copilot,
 * aider, cn, agent`). Returns `{detected, missing}` — detected CLIs with
 * their resolved path + version, missing ones with a structured install
 * hint (any `curl … | sh` installer is flagged `dangerous:true`, CRITICAL
 * I4). Effects: `spawn` (the probes). It never spawns a MODEL and never
 * writes — that is `bootstrap_providers`' job. No probe runs before the
 * user consents (see `discovery-consent.service.ts`).
 */
import { toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
import z from 'zod';

import { discoverProviders } from '../bootstrap';
import type { DiscoveryMode } from '../contracts/interfaces/discovery-consent.interface';
import type { ProbeRunner } from '../healthcheck/probe';
import { DiscoverProvidersOutputSchema } from '../schemas';
import {
	askThroughElicitation,
	discoveryConsent,
} from '../services/discovery-consent.service';

export interface IDiscoverProvidersToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
	readonly discovery: DiscoveryMode;
	readonly consentPath: string;
}

const InputSchema = z.object({});

export const buildDiscoverProvidersRegistration = (
	options: IDiscoverProvidersToolOptions,
): IToolRegistration => ({
	id: 'discover_providers',
	tags: ['orchestrator-runner', 'lazy', 'bootstrap'],
	effects: ['spawn'],
	summary:
		"With the user's consent, probe the host PATH for known provider CLIs and report which are installed vs missing.",
	descriptionKey: 'delendai_orchestrator-runner_discover_providers',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_discover_providers`,
			{
				description:
					'Discover which model-provider CLIs are installed. Runs `command -v` for claude, codex, copilot, aider, cn and agent in parallel on the host PATH and returns {detected:[{id, cliPath, version, authTier}], missing:[{id, installHint:{tool, args, pipeTo?, dangerous}}]}. A missing CLI carries a structured install hint; any hint that pipes a remote script into a shell is flagged dangerous:true. Asks the user first through MCP elicitation (once; the answer is recorded) and probes nothing without a yes — then `consent.next` says how to onboard by questions. Spawns subprocesses; never spends on a model.',
				inputSchema: InputSchema,
				outputSchema: DiscoverProvidersOutputSchema,
			},
			async () => {
				const consent = await discoveryConsent({
					mode: options.discovery,
					consentPath: options.consentPath,
					ask: askThroughElicitation(server),
				});
				if (consent.state !== 'granted')
					return toolJson({ consent, detected: [], missing: [] });
				const result = await discoverProviders(
					options.runner,
					options.workspaceRoot,
				);
				return toolJson({
					consent,
					detected: result.detected,
					missing: result.missing,
				});
			},
		);
	},
});
