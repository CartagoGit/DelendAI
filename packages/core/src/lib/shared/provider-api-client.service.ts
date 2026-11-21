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
	DEFAULT_PROMPT_MAX_TOKENS,
} from '../contracts/constants/provider-api-families.constant';
import type { ICatalogueProvider } from '../contracts/interfaces/account-finding.interface';
import type {
	IProviderAnswer,
	IProviderEndpoint,
	IProviderHttp,
	IProviderUnreachable,
} from '../contracts/interfaces/provider-api.interface';

type IEnv = Readonly<Record<string, string | undefined>>;

/** A scan, not `/\/+$/`: that regex retries at every slash of a long run (`js/polynomial-redos`). */
const trimSlash = (url: string): string => {
	let end = url.length;
	while (end > 0 && url[end - 1] === '/') end -= 1;
	return url.slice(0, end);
};

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

const headersFor = (
	endpoint: Pick<IProviderEndpoint, 'family'>,
	key: string,
): Readonly<Record<string, string>> => {
	if (endpoint.family === 'anthropic')
		return {
			'x-api-key': key,
			'anthropic-version': ANTHROPIC_API_VERSION,
			'content-type': 'application/json',
		};
	if (endpoint.family === 'google')
		return { 'x-goog-api-key': key, 'content-type': 'application/json' };
	return {
		authorization: `Bearer ${key}`,
		'content-type': 'application/json',
	};
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
	// Google lists `models: [{ name: 'models/<id>' }]`; the others `data: [{ id }]`.
	if (endpoint.family === 'google') {
		const models = record(answer.json).models;
		return Array.isArray(models)
			? models.flatMap((model) => {
					const name = record(model).name;
					return typeof name === 'string'
						? [name.replace(/^models\//u, '')]
						: [];
				})
			: [];
	}
	const data = record(answer.json).data;
	return Array.isArray(data)
		? data.flatMap((model) => {
				const id = record(model).id;
				return typeof id === 'string' ? [id] : [];
			})
		: [];
};

/** The HTTP request one prompt to `model` is, for whoever sends it. */
export const providerPromptRequest = (
	endpoint: Pick<IProviderEndpoint, 'family' | 'baseUrl'>,
	key: string,
	input: {
		readonly model: string;
		readonly prompt: string;
		readonly maxTokens?: number | undefined;
	},
): {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
} => {
	const base = trimSlash(endpoint.baseUrl);
	const maxTokens = input.maxTokens ?? DEFAULT_PROMPT_MAX_TOKENS;
	if (endpoint.family === 'google')
		return {
			url: `${base}/models/${encodeURIComponent(input.model)}:generateContent`,
			headers: headersFor(endpoint, key),
			body: JSON.stringify({
				contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
				generationConfig: { maxOutputTokens: maxTokens },
			}),
		};
	return {
		url: `${base}/${endpoint.family === 'anthropic' ? 'messages' : 'chat/completions'}`,
		headers: headersFor(endpoint, key),
		body: JSON.stringify({
			model: input.model,
			max_tokens: maxTokens,
			messages: [{ role: 'user', content: input.prompt }],
		}),
	};
};

/** Google writes `candidates[0].content.parts[].text` and `usageMetadata`. */
const googleAnswer = (body: IRecord): IProviderAnswer => {
	const candidates = Array.isArray(body.candidates) ? body.candidates : [];
	const parts = record(record(candidates[0]).content).parts;
	const usage = record(body.usageMetadata);
	return {
		text: (Array.isArray(parts) ? parts : [])
			.map((part) => record(part).text)
			.filter((text): text is string => typeof text === 'string')
			.join(''),
		usage:
			typeof usage.promptTokenCount === 'number' &&
			typeof usage.candidatesTokenCount === 'number'
				? {
						inputTokens: usage.promptTokenCount,
						outputTokens: usage.candidatesTokenCount,
					}
				: undefined,
	};
};

/** A provider's answer read the way its family writes it. */
export const parseProviderAnswer = (
	family: IProviderEndpoint['family'],
	json: unknown,
): IProviderAnswer => {
	const body = record(json);
	if (family === 'google') return googleAnswer(body);
	const usage = record(body.usage);
	if (family === 'anthropic') {
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
	const request = providerPromptRequest(
		endpoint,
		keyOf(endpoint, input.env ?? process.env),
		input,
	);
	const answer = await (input.http ?? httpProviderCall)(request.url, {
		method: 'POST',
		headers: request.headers,
		body: request.body,
		timeoutMs: PROVIDER_CALL_TIMEOUT_MS,
	});
	if (answer.status >= 400) throw providerRefusal(answer.status, answer.json);
	return parseProviderAnswer(endpoint.family, answer.json);
};
