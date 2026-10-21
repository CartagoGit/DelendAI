/**
 * discover.tool.ts — `<prefix>_discover_providers`.
 *
 * The cheapest half of the bootstrap wizard: a PARALLEL PATH probe
 * (`command -v`) for every client in core's catalogue (`KNOWN_CLIENTS`).
 * Returns `{detected, missing}` — detected CLIs with their resolved path +
 * version, and, for a client that hosts several models, the models it says
 * it reaches by provider; missing ones with a structured install
 * hint (any `curl … | sh` installer is flagged `dangerous:true`, CRITICAL
 * I4). Effects: `spawn` (the probes). It never spawns a MODEL and never
 * writes — that is `bootstrap_providers`' job. No probe runs before the
 * user consents (see `discovery-consent.service.ts`).
 */
import { toolJson } from '@delendai/core/public';
import {
	KNOWN_CLIENTS,
	knownClientOf,
	type IToolRegistration,
} from '@delendai/core/contracts';
import { listClientModels } from '@delendai/core/runtime';
import { listAgents, readModelCatalogue } from '@delendai/core/cli';
import type { IProviderCapabilities } from '@delendai/core/public';
import z from 'zod';

import { discoverProviders } from '../bootstrap';
import type { IDiscoveryMode } from '../contracts/interfaces/discovery-consent.interface';
import type { ProbeRunner } from '../healthcheck/probe';
import { DiscoverProvidersOutputSchema } from '../schemas';
import { proposedRosterEntries } from '../services/acp-roster.service';
import {
	askThroughElicitation,
	discoveryConsent,
} from '../services/discovery-consent.service';

export interface IDiscoverProvidersToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
	readonly discovery: IDiscoveryMode;
	readonly consentPath: string;
	/** Roster entries proposed from ACP agents and catalogue keys; injected by specs. */
	readonly propose?:
		| (() => Promise<readonly IProviderCapabilities[]>)
		| undefined;
}

/** What this machine's agents and keys make possible, as roster entries. */
const proposeFromMachine =
	(workspace: string) =>
	async (): Promise<readonly IProviderCapabilities[]> => {
		const [{ agents }, catalogue] = await Promise.all([
			listAgents({ workspace }),
			readModelCatalogue(),
		]);
		return proposedRosterEntries({
			agents: agents.map((agent) => ({
				id: agent.id,
				canStart: agent.launch !== undefined,
			})),
			catalogue,
			env: process.env,
			existing: [],
		});
	};

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
				description: `Discover which model-provider CLIs are installed. Runs \`command -v\` for ${KNOWN_CLIENTS.map((client) => client.command).join(', ')} in parallel on the host PATH and returns {detected:[{id, cliPath, version, authTier, models?}], missing:[{id, installHint:{tool, args, pipeTo?, dangerous}}]}; a client that hosts several models (OpenCode) lists them by provider, as it reports them. A missing CLI carries a structured install hint; any hint that pipes a remote script into a shell is flagged dangerous:true. Asks the user first through MCP elicitation (once; the answer is recorded) and probes nothing without a yes — then \`consent.next\` says how to onboard by questions. It also returns \`proposed\`: roster entries for every ACP agent that can start here and every model-catalogue provider whose key is set, for the person to confirm; none is written. Spawns subprocesses; never spends on a model.`,
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
				const detected = await Promise.all(
					result.detected.map(async (provider) => {
						const client = knownClientOf(provider.id);
						return client?.modelListArgs === undefined
							? provider
							: {
									...provider,
									models: await listClientModels(
										client,
										options.runner,
										options.workspaceRoot,
									),
								};
					}),
				);
				const proposed = await (
					options.propose ?? proposeFromMachine(options.workspaceRoot)
				)().catch(() => []);
				return toolJson({
					consent,
					detected,
					missing: result.missing,
					...(proposed.length === 0 ? {} : { proposed }),
				});
			},
		);
	},
});
