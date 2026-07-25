import type { IEmbedder } from './embedder';
import type { IEmbedProviderId } from './providers';

export class EmbedderUnavailableError extends Error {
	readonly code = 'embedder-unavailable' as const;

	constructor(
		readonly providerId: IEmbedProviderId,
		message: string,
	) {
		super(message);
		this.name = 'EmbedderUnavailableError';
	}
}

interface IApiEmbedderResponse {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}

export type IApiEmbedderFetch = (
	url: string,
	init: {
		readonly method: 'POST';
		readonly headers: Readonly<Record<string, string>>;
		readonly body: string;
	},
) => Promise<IApiEmbedderResponse>;

export interface IBuildApiEmbedderOptions {
	readonly providerId: IEmbedProviderId;
	readonly apiKey: string;
	readonly fetch?: IApiEmbedderFetch;
	readonly model?: string;
	readonly inputType?: 'query' | 'document';
	readonly baseUrl?: string;
}

interface IProviderRequest {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	parseVector(payload: unknown): readonly number[];
}

const globalFetch: IApiEmbedderFetch | undefined =
	typeof globalThis.fetch === 'function'
		? (globalThis.fetch.bind(globalThis) as IApiEmbedderFetch)
		: undefined;

const parseNumberVector = (value: unknown): readonly number[] | undefined => {
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== 'number')
	) {
		return undefined;
	}
	return value;
};

const failUnavailable = (
	providerId: IEmbedProviderId,
	message: string,
): never => {
	throw new EmbedderUnavailableError(providerId, message);
};

const buildProviderRequest = (
	options: IBuildApiEmbedderOptions,
	text: string,
): IProviderRequest => {
	const baseUrl = options.baseUrl;
	if (options.providerId === 'openai') {
		return {
			url: baseUrl ?? 'https://api.openai.com/v1/embeddings',
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model: options.model ?? 'text-embedding-3-small',
				input: text,
			}),
			parseVector(payload) {
				const data =
					typeof payload === 'object' &&
					payload !== null &&
					Array.isArray((payload as { readonly data?: unknown }).data)
						? (payload as { readonly data: readonly unknown[] })
								.data
						: undefined;
				const first = data?.[0];
				const vector = parseNumberVector(
					typeof first === 'object' && first !== null
						? (first as { readonly embedding?: unknown }).embedding
						: undefined,
				);
				return (
					vector ??
					failUnavailable(
						options.providerId,
						'invalid OpenAI embedding payload',
					)
				);
			},
		};
	}

	if (options.providerId === 'voyage') {
		return {
			url: baseUrl ?? 'https://api.voyageai.com/v1/embeddings',
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model: options.model ?? 'voyage-code-3',
				input: [text],
				input_type:
					options.inputType === 'query' ? 'query' : 'document',
			}),
			parseVector(payload) {
				const data =
					typeof payload === 'object' &&
					payload !== null &&
					Array.isArray((payload as { readonly data?: unknown }).data)
						? (payload as { readonly data: readonly unknown[] })
								.data
						: undefined;
				const first = data?.[0];
				const vector = parseNumberVector(
					typeof first === 'object' && first !== null
						? (first as { readonly embedding?: unknown }).embedding
						: undefined,
				);
				return (
					vector ??
					failUnavailable(
						options.providerId,
						'invalid Voyage embedding payload',
					)
				);
			},
		};
	}

	return {
		url: baseUrl ?? 'https://api.cohere.com/v2/embed',
		headers: {
			authorization: `Bearer ${options.apiKey}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			model: options.model ?? 'embed-v4.0',
			texts: [text],
			input_type:
				options.inputType === 'query'
					? 'search_query'
					: 'search_document',
			embedding_types: ['float'],
		}),
		parseVector(payload) {
			if (typeof payload !== 'object' || payload === null) {
				return failUnavailable(
					options.providerId,
					'invalid Cohere embedding payload',
				);
			}
			const candidate = payload as {
				readonly embeddings?: { readonly float?: readonly unknown[] };
				readonly embeddings_floats?: readonly unknown[];
			};
			const fromEmbeddings = candidate.embeddings?.float?.[0];
			const fromLegacy = candidate.embeddings_floats?.[0];
			const vector =
				parseNumberVector(fromEmbeddings) ??
				parseNumberVector(fromLegacy);
			return (
				vector ??
				failUnavailable(
					options.providerId,
					'invalid Cohere embedding payload',
				)
			);
		},
	};
};

export const buildApiEmbedder = (
	options: IBuildApiEmbedderOptions,
): IEmbedder => {
	const fetchImpl = options.fetch ?? globalFetch;
	return {
		id: `api:${options.providerId}`,
		isAvailable: async () =>
			options.apiKey.trim().length > 0 && fetchImpl !== undefined,
		embed: async (text: string) => {
			if (options.apiKey.trim().length === 0 || fetchImpl === undefined) {
				return failUnavailable(
					options.providerId,
					'API embedder is not configured',
				);
			}
			let response: IApiEmbedderResponse;
			try {
				const request = buildProviderRequest(options, text);
				response = await fetchImpl(request.url, {
					method: 'POST',
					headers: request.headers,
					body: request.body,
				});
				if (!response.ok) {
					return failUnavailable(
						options.providerId,
						`API embedder returned HTTP ${response.status}`,
					);
				}
				const payload = await response.json();
				return request.parseVector(payload);
			} catch (error) {
				if (error instanceof EmbedderUnavailableError) {
					throw error;
				}
				return failUnavailable(
					options.providerId,
					`API embedder request failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	};
};
