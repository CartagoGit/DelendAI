import type { ZodType } from 'zod';

import type {
	IRemotePaginationMeta,
	IRemoteProviderError,
	IRemoteProviderSuccess,
	IRemoteRateLimitMeta,
	IRemoteResponseMeta,
	RemoteProviderErrorCode,
	RemoteProviderId,
} from '@delendai/contracts/remote-provider';

import type { IGitLabProviderContext } from './config';
import { readCapped } from './read-capped.helper';

import {
	DEFAULT_TIMEOUT_MS,
	DEFAULT_MAX_RETRIES,
	DEFAULT_RETRY_DELAY_MS,
	retryableStatuses,
	compatibilityHint,
	transientHint,
	header,
	parseNumber,
	unixSecondsToIso,
	parseLinkRelation,
	parsePaginationMeta,
	parseRateLimitMeta,
	extractRequestId,
	isAbortLike,
} from '@delendai/remote-provider-core';

export interface IRemoteFetchResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
	arrayBuffer?(): Promise<ArrayBuffer>;
	readonly body?: ReadableStream<Uint8Array> | null;
}

export type RemoteFetchFn = (
	url: string,
	init: {
		readonly method: string;
		readonly headers: Readonly<Record<string, string>>;
		readonly body?: string;
		readonly signal: AbortSignal;
	},
) => Promise<IRemoteFetchResponse>;

export interface IGitLabHttpClientDeps {
	readonly fetchFn: RemoteFetchFn;
	readonly now?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly createAbortController?: () => {
		readonly signal: AbortSignal;
		abort(reason?: unknown): void;
	};
	readonly setTimeoutFn?: (cb: () => void, ms: number) => unknown;
	readonly clearTimeoutFn?: (handle: unknown) => void;
}

export interface IGitLabHttpClientOptions {
	readonly context: IGitLabProviderContext;
	readonly defaultHeaders?: Readonly<Record<string, string>>;
	readonly userAgent?: string;
	readonly backoffMs?: (
		attempt: number,
		error: IRemoteProviderError,
	) => number;
}

export interface IGitLabHttpRequestOptions<TResponse> {
	readonly path: string;
	readonly method?: string;
	readonly query?: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly parseAs?: 'json' | 'text' | 'binary';
	/**
	 * For `text` and `binary`: read at most this many bytes and cancel
	 * the rest of the download. A caller that asks for one byte more than
	 * it keeps can tell a body that was cut.
	 */
	readonly maxBytes?: number;
	readonly responseSchema?: ZodType<TResponse>;
	readonly compatibilityCheck?: (
		payload: unknown,
		response: IRemoteFetchResponse,
	) => string | null;
	readonly truncated?: IRemoteResponseMeta['truncated'];
}

const buildUrl = (
	baseUrl: string,
	path: string,
	query: IGitLabHttpRequestOptions<unknown>['query'],
): string => {
	const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
	const url = new URL(
		normalizedPath,
		baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
	);
	if (query === undefined) return url.toString();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null) continue;
		url.searchParams.set(key, String(value));
	}
	return url.toString();
};

const createMeta = (
	response: IRemoteFetchResponse,
	startedAt: number,
	finishedAt: number,
	attempts: number,
	truncated: IRemoteResponseMeta['truncated'],
): IRemoteResponseMeta => ({
	status: response.status,
	requestId: extractRequestId(response.headers),
	durationMs: Math.max(0, finishedAt - startedAt),
	attempts,
	pagination: parsePaginationMeta(response.headers),
	rateLimit: parseRateLimitMeta(response.headers),
	truncated: truncated ?? null,
});

const createError = (input: IRemoteProviderError): IRemoteProviderError => ({
	...input,
});

const createThrownError = (
	provider: RemoteProviderId,
	error: unknown,
): IRemoteProviderError => {
	if (isAbortLike(error)) {
		return createError({
			code: 'timeout',
			provider,
			message: `${provider} request timed out`,
			status: null,
			requestId: null,
			retryAfterSeconds: null,
			temporary: true,
			retryable: true,
		});
	}
	const message = error instanceof Error ? error.message : String(error);
	return createError({
		code: transientHint.test(message) ? 'transient' : 'invalid-response',
		provider,
		message: transientHint.test(message)
			? `${provider} request failed transiently`
			: `${provider} request failed with an invalid response`,
		status: null,
		requestId: null,
		retryAfterSeconds: null,
		temporary: transientHint.test(message),
		retryable: transientHint.test(message),
		details: { cause: message },
	});
};

const createHttpError = (
	provider: RemoteProviderId,
	response: IRemoteFetchResponse,
	body: string,
): IRemoteProviderError => {
	const requestId = extractRequestId(response.headers);
	const retryAfterSeconds = parseNumber(
		header(response.headers, 'retry-after'),
	);
	if (response.status === 401) {
		return createError({
			code: 'unauthorized',
			provider,
			message: `${provider} request was rejected with 401`,
			status: 401,
			requestId,
			retryAfterSeconds,
			temporary: false,
			retryable: false,
		});
	}
	if (response.status === 403) {
		return createError({
			code: 'forbidden',
			provider,
			message: `${provider} request was rejected with 403`,
			status: 403,
			requestId,
			retryAfterSeconds,
			temporary: false,
			retryable: false,
		});
	}
	if (response.status === 404) {
		return createError({
			code: 'not-found',
			provider,
			message: `${provider} resource was not found`,
			status: 404,
			requestId,
			retryAfterSeconds,
			temporary: false,
			retryable: false,
		});
	}
	if (response.status === 429) {
		return createError({
			code: 'rate-limited',
			provider,
			message: `${provider} request hit a rate limit`,
			status: 429,
			requestId,
			retryAfterSeconds,
			temporary: true,
			retryable: false,
		});
	}
	if (
		compatibilityHint.test(body) &&
		(response.status === 400 ||
			response.status === 406 ||
			response.status === 410 ||
			response.status === 415 ||
			response.status === 422)
	) {
		return createError({
			code: 'api-incompatible',
			provider,
			message: `${provider} API replied with an incompatible contract`,
			status: response.status,
			requestId,
			retryAfterSeconds,
			temporary: false,
			retryable: false,
		});
	}
	if (retryableStatuses.has(response.status)) {
		return createError({
			code: 'transient',
			provider,
			message: `${provider} request failed with a transient ${response.status}`,
			status: response.status,
			requestId,
			retryAfterSeconds,
			temporary: true,
			retryable: true,
		});
	}
	return createError({
		code: 'invalid-response',
		provider,
		message: `${provider} request failed with an unsupported response`,
		status: response.status,
		requestId,
		retryAfterSeconds,
		temporary: false,
		retryable: false,
		...(body === '' ? {} : { details: { bodySample: body.slice(0, 200) } }),
	});
};

export class GitLabRequestError extends Error implements IRemoteProviderError {
	readonly code: RemoteProviderErrorCode;
	readonly provider: RemoteProviderId;
	readonly status: number | null;
	readonly requestId: string | null;
	readonly retryAfterSeconds: number | null;
	readonly temporary: boolean;
	readonly retryable: boolean;
	readonly details?: Readonly<
		Record<string, string | number | boolean | null>
	>;

	constructor(readonly remoteError: IRemoteProviderError) {
		super(remoteError.message);
		this.name = 'GitLabRequestError';
		this.code = remoteError.code;
		this.provider = remoteError.provider;
		this.status = remoteError.status;
		this.requestId = remoteError.requestId;
		this.retryAfterSeconds = remoteError.retryAfterSeconds;
		this.temporary = remoteError.temporary;
		this.retryable = remoteError.retryable;
		if (remoteError.details !== undefined) {
			this.details = remoteError.details;
		}
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

const parseResponseBody = async <TResponse>(
	provider: RemoteProviderId,
	response: IRemoteFetchResponse,
	request: IGitLabHttpRequestOptions<TResponse>,
): Promise<TResponse> => {
	if (request.maxBytes !== undefined && request.parseAs !== 'json') {
		const bytes = await readCapped(response, request.maxBytes);
		return (
			request.parseAs === 'binary'
				? bytes.buffer.slice(
						bytes.byteOffset,
						bytes.byteOffset + bytes.byteLength,
					)
				: new TextDecoder('utf-8').decode(bytes)
		) as TResponse;
	}
	if (request.parseAs === 'binary') {
		if (response.arrayBuffer === undefined) {
			throw new GitLabRequestError({
				code: 'invalid-response',
				provider,
				message: `${provider} returned a response that cannot be read as binary`,
				status: response.status,
				requestId: extractRequestId(response.headers),
				retryAfterSeconds: null,
				temporary: false,
				retryable: false,
			});
		}
		return (await response.arrayBuffer()) as TResponse;
	}
	if (request.parseAs === 'text') {
		return (await response.text()) as TResponse;
	}
	const text = await response.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new GitLabRequestError({
			code: 'invalid-response',
			provider,
			message: `${provider} returned a non-JSON body`,
			status: response.status,
			requestId: extractRequestId(response.headers),
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
		});
	}
	const incompatibility =
		request.compatibilityCheck?.(parsed, response) ?? null;
	if (incompatibility !== null) {
		throw new GitLabRequestError({
			code: 'api-incompatible',
			provider,
			message: incompatibility,
			status: response.status,
			requestId: extractRequestId(response.headers),
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
		});
	}
	if (request.responseSchema === undefined) return parsed as TResponse;
	const validated = request.responseSchema.safeParse(parsed);
	if (!validated.success) {
		throw new GitLabRequestError({
			code: 'invalid-response',
			provider,
			message: `${provider} response failed schema validation`,
			status: response.status,
			requestId: extractRequestId(response.headers),
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
			details: { issues: validated.error.issues.length },
		});
	}
	return validated.data;
};

export const createGitLabHttpClient = (
	options: IGitLabHttpClientOptions,
	deps: IGitLabHttpClientDeps,
): {
	readonly request: <TResponse>(
		request: IGitLabHttpRequestOptions<TResponse>,
	) => Promise<IRemoteProviderSuccess<TResponse>>;
} => {
	const now = deps.now ?? Date.now;
	const sleep =
		deps.sleep ??
		((ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const createAbortController =
		deps.createAbortController ?? (() => new AbortController());
	const setTimeoutFn: NonNullable<IGitLabHttpClientDeps['setTimeoutFn']> =
		deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
	const clearTimeoutFn: NonNullable<IGitLabHttpClientDeps['clearTimeoutFn']> =
		deps.clearTimeoutFn ??
		((handle) => {
			clearTimeout(
				handle as number | ReturnType<typeof globalThis.setTimeout>,
			);
		});
	const timeoutMs = options.context.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxRetries = options.context.maxRetries ?? DEFAULT_MAX_RETRIES;
	const retryBaseDelayMs =
		options.context.retryBaseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	const backoffMs =
		options.backoffMs ??
		((attempt: number) => retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));

	return {
		async request<TResponse>(
			request: IGitLabHttpRequestOptions<TResponse>,
		): Promise<IRemoteProviderSuccess<TResponse>> {
			const method = request.method?.toUpperCase() ?? 'GET';
			const url = buildUrl(
				options.context.apiBaseUrl,
				request.path,
				request.query,
			);
			const headers: Record<string, string> = {
				accept: 'application/json',
				authorization: `Bearer ${options.context.token}`,
				...options.defaultHeaders,
				...request.headers,
			};
			if (options.userAgent !== undefined) {
				headers['user-agent'] = options.userAgent;
			}

			let attempts = 0;
			while (true) {
				attempts += 1;
				const controller = createAbortController();
				const startedAt = now();
				const timeoutHandle = setTimeoutFn(
					() => controller.abort(),
					timeoutMs,
				);
				try {
					const response = await deps.fetchFn(url, {
						method,
						headers,
						signal: controller.signal,
						...(request.body !== undefined
							? { body: request.body }
							: {}),
					});
					// The timer covers the body as well: cleared on the
					// headers, a server that trickled the body hung the call.
					if (!response.ok) {
						const body = await response.text();
						clearTimeoutFn(timeoutHandle);
						const normalized = createHttpError(
							'gitlab',
							response,
							body,
						);
						if (
							normalized.retryable &&
							attempts <= maxRetries &&
							(method === 'GET' ||
								method === 'HEAD' ||
								method === 'OPTIONS')
						) {
							await sleep(backoffMs(attempts, normalized));
							continue;
						}
						throw new GitLabRequestError(normalized);
					}
					const data = await parseResponseBody(
						'gitlab',
						response,
						request,
					);
					clearTimeoutFn(timeoutHandle);
					const finishedAt = now();
					return {
						ok: true,
						provider: 'gitlab',
						data,
						meta: createMeta(
							response,
							startedAt,
							finishedAt,
							attempts,
							request.truncated ?? null,
						),
					};
				} catch (error) {
					clearTimeoutFn(timeoutHandle);
					const normalized =
						error instanceof GitLabRequestError
							? error.remoteError
							: createThrownError('gitlab', error);
					if (
						normalized.retryable &&
						attempts <= maxRetries &&
						(method === 'GET' ||
							method === 'HEAD' ||
							method === 'OPTIONS')
					) {
						await sleep(backoffMs(attempts, normalized));
						continue;
					}
					throw error instanceof GitLabRequestError
						? error
						: new GitLabRequestError(normalized);
				}
			}
		},
	};
};
