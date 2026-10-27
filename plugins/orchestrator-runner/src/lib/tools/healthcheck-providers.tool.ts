/**
 * healthcheck-providers.tool.ts — `<prefix>_healthcheck_providers`.
 *
 * Probes every configured provider's CLI on the host PATH (`command -v`
 * + best-effort `--version`), builds a per-provider health row, refreshes
 * the in-memory availability mirror the router reads on the hot path, and
 * persists a durable snapshot for next-boot recovery. Effects: `spawn`
 * (subprocess probe) + `write` (the snapshot). Never spends on a model.
 *
 * A missing CLI yields an `installHint`; any hint that pipes a remote
 * script to a shell (`curl … | sh`) is flagged `dangerous: true` +
 * `pipeTo: 'sh'` (CRITICAL I4).
 */
import { toolJson, type IProviderCapabilities } from '@delendai/core/public';
import {
	knownClientOf,
	type IToolRegistration,
} from '@delendai/core/contracts';
import { listClientModels } from '@delendai/core/runtime';
import z from 'zod';

import {
	availabilityFromHealth,
	buildProviderHealth,
	commandOf,
} from '../healthcheck/report';
import { probeLogin } from '../bootstrap';
import type { IProviderChecks } from '../contracts/interfaces/provider-checks.interface';
import { probeCli, type ProbeRunner } from '../healthcheck/probe';
import type { HealthStore } from '../healthcheck/store';
import { HealthcheckOutputSchema } from '../schemas';

export interface IHealthcheckToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly healthcheckPath: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
}

const InputSchema = z.object({});

/**
 * Ask an installed known client whether it is logged in, and which models
 * it reaches when it lists them; a client nobody can ask says nothing.
 */
const askClient = async (
	command: string,
	runner: ProbeRunner,
	cwd: string,
): Promise<IProviderChecks> => {
	const login = await probeLogin(command, runner, cwd);
	const client = knownClientOf(command);
	const listed =
		client?.modelListArgs === undefined
			? undefined
			: await listClientModels(client, runner, cwd).catch(
					() => undefined,
				);
	return {
		verdict: login.verdict,
		authTier: login.authTier,
		...(listed?.listed === true
			? {
					models: listed.providers.flatMap(({ provider, models }) =>
						models.flatMap((model) => [
							model,
							`${provider}/${model}`,
						]),
					),
				}
			: {}),
	};
};

export const buildHealthcheckProvidersRegistration = (
	options: IHealthcheckToolOptions,
): IToolRegistration => ({
	id: 'healthcheck_providers',
	tags: ['orchestrator-runner', 'lazy', 'healthcheck'],
	effects: ['spawn', 'write'],
	writeRoot: 'host-state',
	summary:
		'Probe each configured provider CLI on PATH and report install/auth/model availability.',
	descriptionKey: 'delendai_orchestrator-runner_healthcheck_providers',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_healthcheck_providers`,
			{
				description:
					'Probe every configured model provider to see which are usable right now. For each provider it runs `command -v <cli>` (and a best-effort `--version`) on the host PATH and returns {cli.installed, cli.path, cli.version, auth, model, overall, installHint?}. A missing CLI carries an installHint; any hint that pipes a remote script into a shell is flagged dangerous:true. Refreshes the in-memory availability mirror the router uses and writes a durable snapshot. Spawns subprocesses; never spends on a model.',
				inputSchema: InputSchema,
				outputSchema: HealthcheckOutputSchema,
			},
			async () => {
				const providers = await Promise.all(
					options.providers.map(async (provider) => {
						const command = commandOf(provider);
						const probe =
							command === null
								? null
								: await probeCli(
										command,
										options.runner,
										options.workspaceRoot,
									);
						return buildProviderHealth(
							provider,
							probe,
							command === null || probe?.installed !== true
								? {}
								: await askClient(
										command,
										options.runner,
										options.workspaceRoot,
									),
						);
					}),
				);

				// Refresh the in-memory mirror + persist durably.
				options.health.setAll(providers.map(availabilityFromHealth));
				await options.health.persist(options.healthcheckPath);

				const available = providers.filter(
					(p) => p.overall === 'available',
				).length;

				return toolJson({
					checkedAt: new Date().toISOString(),
					providers,
					summary: {
						total: providers.length,
						available,
						unavailable: providers.length - available,
					},
				});
			},
		);
	},
});
