/**
 * account-sources.service.ts — every place on the machine that suggests an
 * account, read without a list of vendors.
 *
 * The offer knew only coding clients whose status answer matched a
 * hand-written pattern: on the owner's machine it found Claude Code and
 * Codex while OpenCode reached five MiniMax providers, a MiniMax key was
 * in the environment, mmx held the MiniMax plan and Copilot served qwen,
 * glm and MiniMax. Each source here reports what it saw and, when it can
 * tell, who it is with and how it is paid; what it cannot tell is left
 * for the person to answer, never dropped.
 */
import {
	CREDENTIAL_VARIABLE_PATTERN,
	LOCAL_MODEL_ENDPOINTS,
	LOCAL_PROBE_TIMEOUT_MS,
	PLAN_TOOLS,
} from '../contracts/constants/account-sources.constant';
import type {
	IAccountFinding,
	ILocalFetch,
	IPlanTool,
} from '../contracts/interfaces/account-finding.interface';
import type {
	IClientCommandRunner,
	IClientDiscovery,
} from '../contracts/interfaces/known-client.interface';
import { clientLogin, listClientModels } from './client-discovery.service';

const PLAN_TOOL_TIMEOUT_MS = 20_000;

/** Lower-case kebab: how an id is written, whatever the source spelt. */
export const kebab = (value: string): string =>
	value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-|-$/gu, '');

/** The letters a model id opens with: its maker as the id names it. */
export const brandOf = (model: string): string =>
	/^[a-z]+/u.exec(model.toLowerCase())?.[0] ?? kebab(model);

/** A logged-in coding client whose answer says how it bills. */
export const findingsFromClients = (
	discoveries: readonly IClientDiscovery[],
): readonly IAccountFinding[] =>
	discoveries.flatMap((discovery) => {
		if (discovery.verdict !== 'usable') return [];
		const { client, login } = discovery;
		return [
			{
				key: `client-login:${client.command}`,
				source: 'client-login' as const,
				accountId: kebab(`${client.vendor}-${client.command}`),
				displayName: `${client.label}, as logged in on this machine`,
				vendorHint: client.vendor,
				...(login === undefined
					? {}
					: { classification: { vendor: client.vendor, ...login } }),
				models: [],
				evidence:
					discovery.evidence?.line ??
					`${client.command} is logged in`,
			},
		];
	});

/** Every provider a multi-provider client reaches (OpenCode lists them). */
export const findingsFromClientProviders = async (
	discoveries: readonly IClientDiscovery[],
	run: IClientCommandRunner,
	cwd: string,
): Promise<readonly IAccountFinding[]> => {
	const found: IAccountFinding[] = [];
	for (const discovery of discoveries) {
		if (discovery.verdict === 'not-installed') continue;
		if (discovery.client.modelListArgs === undefined) continue;
		const listed = await listClientModels(discovery.client, run, cwd);
		for (const { provider, models } of listed.providers) {
			found.push({
				key: `client-provider:${discovery.client.command}/${provider}`,
				source: 'client-provider',
				accountId: kebab(`${provider}-via-${discovery.client.command}`),
				displayName: `${provider}, reached through ${discovery.client.label}`,
				vendorHint: brandOf(provider),
				models,
				evidence: `${discovery.client.command} lists ${String(models.length)} model(s) under ${provider}`,
			});
		}
	}
	return found;
};

/** Variables named like a credential; their values are never read. */
export const findingsFromCredentialVariables = (
	env: Readonly<Record<string, string | undefined>>,
): readonly IAccountFinding[] =>
	Object.keys(env)
		.sort()
		.flatMap((name) => {
			const match = CREDENTIAL_VARIABLE_PATTERN.exec(name);
			if (match === null || (env[name] ?? '').trim().length === 0)
				return [];
			const vendor = kebab(match[1] ?? name);
			return [
				{
					key: `credential-variable:${name}`,
					source: 'credential-variable' as const,
					accountId: kebab(`${vendor}-key`),
					displayName: `the key in ${name}`,
					vendorHint: vendor,
					credentialEnv: name,
					models: [],
					evidence: `${name} is set (its value is not read)`,
				},
			];
		});

/** The makers of the models this person's chats were served by. */
export const findingsFromSeenModels = (
	models: readonly string[],
): readonly IAccountFinding[] => {
	const byBrand = new Map<string, string[]>();
	for (const model of models) {
		const brand = brandOf(model);
		byBrand.set(brand, [...(byBrand.get(brand) ?? []), model]);
	}
	return [...byBrand].map(([brand, served]) => ({
		key: `seen-models:${brand}`,
		source: 'seen-models' as const,
		accountId: kebab(`${brand}-seen`),
		displayName: `${brand} models your chats were served by`,
		vendorHint: brand,
		models: served,
		evidence: `seen serving chats here: ${served.join(', ')}`,
	}));
};

/** Vendor plan tools logged in to a plan (mmx), from their own answer. */
export const findingsFromPlanTools = async (
	run: IClientCommandRunner,
	cwd: string,
	tools: readonly IPlanTool[] = PLAN_TOOLS,
): Promise<readonly IAccountFinding[]> => {
	const found: IAccountFinding[] = [];
	for (const tool of tools) {
		const answer = await run(
			[tool.command, ...tool.loginStatusArgs].join(' '),
			{
				cwd,
				timeoutMs: PLAN_TOOL_TIMEOUT_MS,
			},
		).catch(() => undefined);
		if (answer === undefined || answer.code !== 0) continue;
		const login = clientLogin(tool, answer);
		found.push({
			key: `plan-tool:${tool.command}`,
			source: 'plan-tool',
			accountId: kebab(`${tool.vendor}-plan`),
			displayName: tool.label,
			vendorHint: tool.vendor,
			...(login === undefined
				? {}
				: { classification: { vendor: tool.vendor, ...login } }),
			models: [],
			evidence: `${tool.command} ${tool.loginStatusArgs.join(' ')} answered`,
		});
	}
	return found;
};

/** Local OpenAI-compatible servers, and the models each lists. */
export const findingsFromLocalEndpoints = async (
	fetchModels: ILocalFetch,
): Promise<readonly IAccountFinding[]> => {
	const found: IAccountFinding[] = [];
	for (const endpoint of LOCAL_MODEL_ENDPOINTS) {
		const url = `http://127.0.0.1:${String(endpoint.port)}/v1/models`;
		const answer = await fetchModels(url, LOCAL_PROBE_TIMEOUT_MS).catch(
			() => undefined,
		);
		const data = (answer?.json as { data?: unknown } | undefined)?.data;
		if (answer?.ok !== true || !Array.isArray(data)) continue;
		const models = data.flatMap((entry) =>
			typeof (entry as { id?: unknown }).id === 'string'
				? [String((entry as { id: string }).id)]
				: [],
		);
		found.push({
			key: `local-endpoint:${String(endpoint.port)}`,
			source: 'local-endpoint',
			accountId: kebab(`${endpoint.name}-local`),
			displayName: `${endpoint.name} on this machine (port ${String(endpoint.port)})`,
			vendorHint: endpoint.name,
			classification: {
				vendor: endpoint.name,
				credentialMode: 'local-none',
				billingMode: 'local',
			},
			models,
			evidence: `${url} lists ${String(models.length)} model(s)`,
		});
	}
	return found;
};

/** A real fetch of a local endpoint, bounded by `timeoutMs`. */
export const fetchLocalModels: ILocalFetch = async (url, timeoutMs) => {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		return {
			ok: response.ok,
			json: response.ok
				? ((await response.json()) as unknown)
				: undefined,
		};
	} catch {
		return undefined;
	}
};

/** Every source, in the order an offer is made: what says most first. */
export const gatherFindings = async (input: {
	readonly discoveries: readonly IClientDiscovery[];
	readonly run: IClientCommandRunner;
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly seen: readonly string[];
	readonly planTools?: readonly IPlanTool[] | undefined;
	readonly fetchLocal?: ILocalFetch | undefined;
}): Promise<readonly IAccountFinding[]> => [
	...findingsFromClients(input.discoveries),
	...(await findingsFromPlanTools(input.run, input.cwd, input.planTools)),
	...(input.fetchLocal === undefined
		? []
		: await findingsFromLocalEndpoints(input.fetchLocal)),
	...(await findingsFromClientProviders(
		input.discoveries,
		input.run,
		input.cwd,
	)),
	...findingsFromCredentialVariables(input.env),
	...findingsFromSeenModels(input.seen),
];
