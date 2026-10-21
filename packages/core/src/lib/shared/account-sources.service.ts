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
import { toKebabCase } from './string-normalize';

const PLAN_TOOL_TIMEOUT_MS = 20_000;

/** The letters a model id opens with: its maker as the id names it. */
export const brandOf = (model: string): string =>
	/^[a-z]+/u.exec(model.toLowerCase())?.[0] ?? toKebabCase(model);

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
				accountId: toKebabCase(`${client.vendor}-${client.command}`),
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
	const listing = discoveries.filter(
		(discovery) =>
			discovery.verdict !== 'not-installed' &&
			discovery.client.modelListArgs !== undefined,
	);
	const lists = await Promise.all(
		listing.map((discovery) =>
			listClientModels(discovery.client, run, cwd),
		),
	);
	const found: IAccountFinding[] = [];
	for (const [index, discovery] of listing.entries()) {
		for (const { provider, models } of lists[index]?.providers ?? []) {
			found.push({
				key: `client-provider:${discovery.client.command}/${provider}`,
				source: 'client-provider',
				accountId: toKebabCase(
					`${provider}-via-${discovery.client.command}`,
				),
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
			const vendor = toKebabCase(match[1] ?? name);
			return [
				{
					key: `credential-variable:${name}`,
					source: 'credential-variable' as const,
					accountId: toKebabCase(`${vendor}-key`),
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
		accountId: toKebabCase(`${brand}-seen`),
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
	const found = await Promise.all(
		tools.map(async (tool): Promise<IAccountFinding | undefined> => {
			const answer = await run(
				[tool.command, ...tool.loginStatusArgs].join(' '),
				{ cwd, timeoutMs: PLAN_TOOL_TIMEOUT_MS },
			).catch(() => undefined);
			if (answer === undefined || answer.code !== 0) return undefined;
			const login = clientLogin(tool, answer);
			return {
				key: `plan-tool:${tool.command}`,
				source: 'plan-tool',
				accountId: toKebabCase(`${tool.vendor}-plan`),
				displayName: tool.label,
				vendorHint: tool.vendor,
				...(login === undefined
					? {}
					: { classification: { vendor: tool.vendor, ...login } }),
				models: [],
				evidence: `${tool.command} ${tool.loginStatusArgs.join(' ')} answered`,
			};
		}),
	);
	return found.filter((each): each is IAccountFinding => each !== undefined);
};

/** Local OpenAI-compatible servers, and the models each lists. */
export const findingsFromLocalEndpoints = async (
	fetchModels: ILocalFetch,
): Promise<readonly IAccountFinding[]> => {
	const urlOf = (port: number): string =>
		`http://127.0.0.1:${String(port)}/v1/models`;
	const answers = await Promise.all(
		LOCAL_MODEL_ENDPOINTS.map((endpoint) =>
			fetchModels(urlOf(endpoint.port), LOCAL_PROBE_TIMEOUT_MS).catch(
				() => undefined,
			),
		),
	);
	const found: IAccountFinding[] = [];
	for (const [index, endpoint] of LOCAL_MODEL_ENDPOINTS.entries()) {
		const url = urlOf(endpoint.port);
		const answer = answers[index];
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
			accountId: toKebabCase(`${endpoint.name}-local`),
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
	/** Told each step as it starts, so a person sees it is working. */
	readonly onProgress?: ((step: string) => void) | undefined;
}): Promise<readonly IAccountFinding[]> => {
	const said = input.onProgress ?? (() => undefined);
	said('plan tools, local servers and the providers clients reach');
	// The slow ones together: each is a command or a port with its own
	// deadline, and read one after another they kept a person waiting.
	const [plans, locals, providers] = await Promise.all([
		findingsFromPlanTools(input.run, input.cwd, input.planTools),
		input.fetchLocal === undefined
			? Promise.resolve([])
			: findingsFromLocalEndpoints(input.fetchLocal),
		findingsFromClientProviders(input.discoveries, input.run, input.cwd),
	]);
	said('credential variables and the models your chats used');
	return [
		...findingsFromClients(input.discoveries),
		...plans,
		...locals,
		...providers,
		...findingsFromCredentialVariables(input.env),
		...findingsFromSeenModels(input.seen),
	];
};
