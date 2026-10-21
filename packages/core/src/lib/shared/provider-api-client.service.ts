/**
 * provider-api-client.service.ts — any provider of the model catalogue,
 * called directly: at the catalogue's API URL, through the family its SDK
 * package names, with the key read from its variable at call time.
 *
 * The key is never stored or logged: it goes from the variable into one
 * request header. A provider whose family delendai does not speak, or
 * whose key is not set, is reported as unreachable with the reason.
 */
import {
	ANTHROPIC_API_VERSION,
	FAMILY_DEFAULT_BASE_URL,
	PROVIDER_API_FAMILIES,
	PROVIDER_CALL_TIMEOUT_MS,
} from '../contracts/constants/provider-api-families.constant';
import type { ICatalogueProvider } from '../contracts/interfaces/account-finding.interface';
import type {
	IProviderAnswer,
	IProviderEndpoint,
	IProviderHttp,
	IProviderUnreachable,
} from '../contracts/interfaces/provider-api.interface';

type IEnv = Readonly<Record<string, string | undefined>>;

const trimSlash = (url: string): string => url.replace(/\/+$/u, '');

/** Where and how `provider` is called, or why it cannot be. */
export const providerEndpoint = (
	provider: ICatalogueProvider,
	env: IEnv,
): IProviderEndpoint | IProviderUnreachable => {
	const family =
		provider.npm === undefined
			? undefined
			: PROVIDER_API_FAMILIES[provider.npm];
	if (family === undefined)
		return { reason: 'unsupported-family', npm: provider.npm };
	const keyVariable = provider.env.find(
		(name) => (env[name] ?? '').trim().length > 0,
	);
	if (keyVariable === undefined)
		return { reason: 'no-key', variables: provider.env };
	return {
		providerId: provider.id,
		family,
		baseUrl: trimSlash(provider.api ?? FAMILY_DEFAULT_BASE_URL[family]),
		keyVariable,
	};
};

export const isReachable = (
	endpoint: IProviderEndpoint | IProviderUnreachable,
): endpoint is IProviderEndpoint => 'family' in endpoint;

const headersFor = (endpoint: IProviderEndpoint, key: string) =>
	endpoint.family === 'anthropic'
		? {
				'x-api-key': key,
				'anthropic-version': ANTHROPIC_API_VERSION,
				'content-type': 'application/json',
			}
		: {
				authorization: `Bearer ${key}`,
				'content-type': 'application/json',
			};

const keyOf = (endpoint: IProviderEndpoint, env: IEnv): string => {
	const key = env[endpoint.keyVariable]?.trim();
	if (key === undefined || key.length === 0)
		throw new Error(`${endpoint.keyVariable} is not set`);
	return key;
};

export const httpProviderCall: IProviderHttp = async (url, init) => {
	const response = await fetch(url, {
		method: init.method,
		headers: { ...init.headers },
		...(init.body === undefined ? {} : { body: init.body }),
		signal: AbortSignal.timeout(init.timeoutMs),
	});
	return {
		status: response.status,
		json: (await response.json().catch(() => undefined)) as unknown,
	};
};

type IRecord = Readonly<Record<string, unknown>>;
const record = (value: unknown): IRecord =>
	value !== null && typeof value === 'object' ? (value as IRecord) : {};

const providerRefusal = (status: number, json: unknown): Error => {
	const error = record(record(json).error);
	const message = typeof error.message === 'string' ? error.message : '';
	return new Error(
		`the provider answered ${String(status)}${message ? `: ${message}` : ''}`,
	);
};

/** The models the provider's own API lists; costs no tokens. */
export const listProviderModels = async (
	endpoint: IProviderEndpoint,
	options: { readonly env?: IEnv; readonly http?: IProviderHttp } = {},
): Promise<readonly string[]> => {
	const key = keyOf(endpoint, options.env ?? process.env);
	const answer = await (options.http ?? httpProviderCall)(
		`${endpoint.baseUrl}/models`,
		{
			method: 'GET',
			headers: headersFor(endpoint, key),
			timeoutMs: PROVIDER_CALL_TIMEOUT_MS,
		},
	);
	if (answer.status >= 400) throw providerRefusal(answer.status, answer.json);
	const data = record(answer.json).data;
	return Array.isArray(data)
		? data.flatMap((model) => {
				const id = record(model).id;
				return typeof id === 'string' ? [id] : [];
			})
		: [];
};

/** One prompt to `model`; it spends what the provider bills for it. */
export const promptProvider = async (
	endpoint: IProviderEndpoint,
	input: {
		readonly model: string;
		readonly prompt: string;
		readonly maxTokens?: number | undefined;
		readonly env?: IEnv | undefined;
		readonly http?: IProviderHttp | undefined;
	},
): Promise<IProviderAnswer> => {
	const key = keyOf(endpoint, input.env ?? process.env);
	const messages = [{ role: 'user', content: input.prompt }];
	const anthropic = endpoint.family === 'anthropic';
	const answer = await (input.http ?? httpProviderCall)(
		`${endpoint.baseUrl}/${anthropic ? 'messages' : 'chat/completions'}`,
		{
			method: 'POST',
			headers: headersFor(endpoint, key),
			body: JSON.stringify({
				model: input.model,
				max_tokens: input.maxTokens ?? 1024,
				messages,
			}),
			timeoutMs: PROVIDER_CALL_TIMEOUT_MS,
		},
	);
	if (answer.status >= 400) throw providerRefusal(answer.status, answer.json);
	const body = record(answer.json);
	const usage = record(body.usage);
	if (anthropic) {
		const content = Array.isArray(body.content) ? body.content : [];
		return {
			text: content
				.map((part) => record(part))
				.filter(
					(part) =>
						part.type === 'text' && typeof part.text === 'string',
				)
				.map((part) => part.text as string)
				.join(''),
			usage:
				typeof usage.input_tokens === 'number' &&
				typeof usage.output_tokens === 'number'
					? {
							inputTokens: usage.input_tokens,
							outputTokens: usage.output_tokens,
						}
					: undefined,
		};
	}
	const choices = Array.isArray(body.choices) ? body.choices : [];
	const content = record(record(choices[0]).message).content;
	return {
		text: typeof content === 'string' ? content : '',
		usage:
			typeof usage.prompt_tokens === 'number' &&
			typeof usage.completion_tokens === 'number'
				? {
						inputTokens: usage.prompt_tokens,
						outputTokens: usage.completion_tokens,
					}
				: undefined,
	};
};
