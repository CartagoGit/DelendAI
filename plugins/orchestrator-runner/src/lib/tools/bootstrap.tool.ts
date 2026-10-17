/**
 * bootstrap.tool.ts — `<prefix>_bootstrap_providers`.
 *
 * The full bootstrap wizard (wiki §3): PATH probe → best-effort auth RPC per
 * detected CLI → write a DRAFT roster to
 * `${cacheDir}/orchestrator-runner/roster.draft.json` (durably) → return a
 * PROSE brief plus an RFC 6902 JSON Patch (CRITICAL I13) for the caller to
 * apply — via MCP elicitation or a CLI prompt — to
 * `delendai.config.json#providers` on user confirm.
 *
 * The wizard NEVER writes the confirmed config itself (the trust gradient,
 * §1): confirmed intent is the user's to own. It only writes the cache draft
 * and hands back a reviewable patch. Re-running is non-destructive — the
 * patch only ADDS providers whose id is not already confirmed. Effects:
 * `spawn` (probes) + `write` (the draft). Never spends on a model, and
 * probes nothing before the user consents.
 */
import { toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
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
import type { DiscoveryMode } from '../contracts/interfaces/discovery-consent.interface';
import type { ProbeRunner } from '../healthcheck/probe';
import { BootstrapProvidersOutputSchema } from '../schemas';
import {
	askThroughElicitation,
	discoveryConsent,
} from '../services/discovery-consent.service';

export interface IBootstrapProvidersToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly rosterDraftPath: string;
	readonly configPath: string;
	readonly runner: ProbeRunner;
	readonly discovery: DiscoveryMode;
	readonly consentPath: string;
}

const InputSchema = z.object({});

export const buildBootstrapProvidersRegistration = (
	options: IBootstrapProvidersToolOptions,
): IToolRegistration => ({
	id: 'bootstrap_providers',
	tags: ['orchestrator-runner', 'lazy', 'bootstrap'],
	effects: ['spawn', 'write'],
	writeRoot: 'host-state',
	summary:
		'Run the provider bootstrap wizard: probe, draft a roster, and return a prose brief + config patch.',
	descriptionKey: 'delendai_orchestrator-runner_bootstrap_providers',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_bootstrap_providers`,
			{
				description:
					'Run the provider bootstrap wizard. Probes the PATH for provider CLIs, runs a best-effort auth/status RPC per detected tool to learn its tier, writes a DRAFT roster to the cache (roster.draft.json), and returns {detected, missing, rosterDraftPath, configPatch, brief, note}. The brief is prose the assistant relays to the user (asking spend preference + task types). `configPatch` is an RFC 6902 JSON Patch that ADDS the newly-discovered providers to delendai.config.json#providers — apply it via elicitation / a CLI prompt only after the user confirms. The wizard never writes the confirmed config itself. Asks the user first through MCP elicitation (once; the answer is recorded); without a yes nothing is probed or written and `consent.next` says how to onboard by questions. Spawns subprocesses and writes the cache draft; never spends on a model.',
				inputSchema: InputSchema,
				outputSchema: BootstrapProvidersOutputSchema,
			},
			async () => {
				// 0. Nothing runs on the user's machine before they say yes.
				const consent = await discoveryConsent({
					mode: options.discovery,
					consentPath: options.consentPath,
					ask: askThroughElicitation(server),
				});
				if (consent.state !== 'granted')
					return toolJson({
						consent,
						detected: [],
						missing: [],
						rosterDraftPath: options.rosterDraftPath,
						configPatch: [],
						brief: consent.next ?? '',
						note: 'Nothing was probed and no draft was written.',
					});

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
					consent,
					detected,
					missing: discovery.missing,
					rosterDraftPath: options.rosterDraftPath,
					configPatch,
					brief: composeBootstrapBrief(enriched),
					note: 'This is a draft. Review `configPatch` and apply it to delendai.config.json#providers only on user confirm (RFC 6902 JSON Patch). Re-running is non-destructive: it never overwrites an already-confirmed provider id.',
				});
			},
		);
	},
});
