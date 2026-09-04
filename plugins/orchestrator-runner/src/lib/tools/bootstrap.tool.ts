/**
 * bootstrap.tool.ts — `<prefix>_bootstrap_providers`.
 *
 * The full bootstrap wizard (wiki §3): PATH probe → best-effort auth RPC per
 * detected CLI → write a DRAFT roster to
 * `${cacheDir}/orchestrator-runner/roster.draft.json` (durably) → return a
 * PROSE brief plus an RFC 6902 JSON Patch (CRITICAL I13) for the caller to
 * apply — via MCP elicitation or a CLI prompt — to
 * `mcp-vertex.config.json#providers` on user confirm.
 *
 * The wizard NEVER writes the confirmed config itself (the trust gradient,
 * §1): confirmed intent is the user's to own. It only writes the cache draft
 * and hands back a reviewable patch. Re-running is non-destructive — the
 * patch only ADDS providers whose id is not already confirmed. Effects:
 * `spawn` (probes) + `write` (the draft). Never spends on a model.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import {
	buildProvidersPatch,
	buildRosterDraft,
	composeBootstrapBrief,
	discoverProviders,
	probeAuthTier,
	readConfirmedProviders,
	writeRosterDraft,
	type IDiscoveredProvider,
} from '../bootstrap';
import type { ProbeRunner } from '../healthcheck/probe';
import { BootstrapProvidersOutputSchema } from '../schemas';

export interface IBootstrapProvidersToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly rosterDraftPath: string;
	readonly configPath: string;
	readonly runner: ProbeRunner;
}

const InputSchema = z.object({});

export const buildBootstrapProvidersRegistration = (
	options: IBootstrapProvidersToolOptions,
): IToolRegistration => ({
	id: 'bootstrap_providers',
	tags: ['orchestrator-runner', 'lazy', 'bootstrap'],
	effects: ['spawn', 'write'],
	summary:
		'Run the provider bootstrap wizard: probe, draft a roster, and return a prose brief + config patch.',
	descriptionKey: 'mcp-vertex_orchestrator-runner_bootstrap_providers',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_bootstrap_providers`,
			{
				description:
					'Run the provider bootstrap wizard. Probes the PATH for provider CLIs, runs a best-effort auth/status RPC per detected tool to learn its tier, writes a DRAFT roster to the cache (roster.draft.json), and returns {detected, missing, rosterDraftPath, configPatch, brief, note}. The brief is prose the assistant relays to the user (asking spend preference + task types). `configPatch` is an RFC 6902 JSON Patch that ADDS the newly-discovered providers to mcp-vertex.config.json#providers — apply it via elicitation / a CLI prompt only after the user confirms. The wizard never writes the confirmed config itself. Spawns subprocesses and writes the cache draft; never spends on a model.',
				inputSchema: InputSchema,
				outputSchema: BootstrapProvidersOutputSchema,
			},
			async () => {
				// 1. PATH probe (parallel).
				const discovery = await discoverProviders(
					options.runner,
					options.workspaceRoot,
				);

				// 2. Best-effort auth RPC per detected tool (parallel; never
				// fails the wizard — a missing tier stays null).
				const detected: IDiscoveredProvider[] = await Promise.all(
					discovery.detected.map(async (provider) => ({
						...provider,
						authTier: await probeAuthTier(
							provider.id,
							options.runner,
							options.workspaceRoot,
						),
					})),
				);
				const enriched = { detected, missing: discovery.missing };

				// 3. Write the DRAFT roster durably (mutex → redact → atomic).
				const draft = buildRosterDraft(enriched);
				await writeRosterDraft(options.rosterDraftPath, draft);

				// 4. Build the RFC 6902 patch against the confirmed config
				// (tolerating a missing/no-`providers` config → creates it).
				const confirmed = await readConfirmedProviders(
					options.configPath,
				);
				const configPatch = buildProvidersPatch(confirmed, detected);

				return toolJson({
					detected,
					missing: discovery.missing,
					rosterDraftPath: options.rosterDraftPath,
					configPatch,
					brief: composeBootstrapBrief(enriched),
					note: 'This is a draft. Review `configPatch` and apply it to mcp-vertex.config.json#providers only on user confirm (RFC 6902 JSON Patch). Re-running is non-destructive: it never overwrites an already-confirmed provider id.',
				});
			},
		);
	},
});
