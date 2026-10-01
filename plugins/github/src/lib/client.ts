import type z from 'zod';

import type {
	IRemotePaginationMeta,
	IRemoteProviderError,
	IRemoteProviderSuccess,
	IRemoteRateLimitMeta,
	IRemoteResponseMeta,
	RemoteProviderErrorCode,
	RemoteProviderId,
} from '@delendai/contracts/remote-provider';

import type { IGitHubProviderContext } from './config';

export interface IRemoteFetchResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
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

export const toRemoteFetchResponse = (
	response: Response,
): IRemoteFetchResponse => ({
	ok: response.ok,
	status: response.status,
	headers: {
		get(name: string): string | null {
			return response.headers.get(name);
		},
	},
	text: async () => response.text(),
});

export const createGitHubRemoteFetchFn =
	(fetchFn: typeof fetch): RemoteFetchFn =>
	async (url, init) =>
		toRemoteFetchResponse(await fetchFn(url, init));

export interface IGitHubHttpClientDeps {
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

export interface IGitHubHttpClientOptions {
	readonly context: IGitHubProviderContext;
	readonly defaultHeaders?: Readonly<Record<string, string>>;
	readonly userAgent?: string;
	readonly backoffMs?: (
		attempt: number,
		error: IRemoteProviderError,
	) => number;
}

export interface IGitHubHttpRequestOptions<TResponse> {
	readonly path: string;
	readonly method?: string;
	readonly query?: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly parseAs?: 'json' | 'text';
	readonly responseSchema?: z.ZodType<TResponse>;
	readonly compatibilityCheck?: (
		payload: unknown,
		response: IRemoteFetchResponse,
	) => string | null;
	readonly truncated?: IRemoteResponseMeta['truncated'];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

const retryableStatuses = new Set([408, 425, 500, 502, 503, 504]);
const compatibilityHint =
	/(unsupported|deprecated api|unsupported api|preview|incompatible|unknown version)/i;
const transientHint =
	/(econnreset|econnrefused|eai_again|enotfound|network|socket|fetch failed|temporar)/i;

const redactToken = (value: string, token: string): string => {
	if (token.length === 0 || value.length === 0) return value;
	return value
		.split(`Bearer ${token}`)
		.join('Bearer [REDACTED]')
		.split(token)
		.join('[REDACTED]');
};

const header = (
	headers: { get(name: string): string | null },
	name: string,
): string | null => headers.get(name) ?? headers.get(name.toLowerCase());

const parseNumber = (raw: string | null): number | null => {
	if (raw === null) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
};

const unixSecondsToIso = (raw: string | null): string | null => {
	const seconds = parseNumber(raw);
	if (seconds === null) return null;
	return new Date(seconds * 1000).toISOString();
};

const parseLinkRelation = (
	linkHeader: string | null,
	rel: 'next' | 'prev',
): string | null => {
	if (linkHeader === null) return null;
	for (const part of linkHeader.split(',')) {
		if (!part.includes(`rel="${rel}"`)) continue;
		const match = part.match(/<([^>]+)>/);
		if (match?.[1] === undefined) return null;
		try {
			const url = new URL(match[1]);
			return url.searchParams.get('page') ?? match[1];
		} catch {
			return match[1];
		}
	}
	return null;
};

const parsePaginationMeta = (headers: {
	get(name: string): string | null;
}): IRemotePaginationMeta | null => {
	const linkHeader = header(headers, 'link');
	const nextPage =
		header(headers, 'x-next-page') ?? parseLinkRelation(linkHeader, 'next');
	const previousPage =
		header(headers, 'x-prev-page') ?? parseLinkRelation(linkHeader, 'prev');
	const page = parseNumber(header(headers, 'x-page'));
	const perPage = parseNumber(header(headers, 'x-per-page'));
	const total = parseNumber(header(headers, 'x-total'));
	const totalPages = parseNumber(header(headers, 'x-total-pages'));
	if (
		nextPage === null &&
		previousPage === null &&
		page === null &&
		perPage === null &&
		total === null &&
		totalPages === null
	) {
		return null;
	}
	return {
		page,
		perPage,
		nextPage,
		previousPage,
		total,
		totalPages,
		hasMore: nextPage !== null,
	};
};

const parseRateLimitMeta = (headers: {
	get(name: string): string | null;
}): IRemoteRateLimitMeta | null => {
	const limit = parseNumber(header(headers, 'x-ratelimit-limit'));
	const remaining = parseNumber(header(headers, 'x-ratelimit-remaining'));
	const resetAt = unixSecondsToIso(header(headers, 'x-ratelimit-reset'));
	const retryAfterSeconds = parseNumber(header(headers, 'retry-after'));
	const scopeRaw = header(headers, 'x-ratelimit-resource');
	const scope =
		scopeRaw === 'api' ||
		scopeRaw === 'core' ||
		scopeRaw === 'search' ||
		scopeRaw === 'graphql'
			? scopeRaw
			: 'unknown';
	if (
		limit === null &&
		remaining === null &&
		resetAt === null &&
		retryAfterSeconds === null &&
		scope === 'unknown'
	) {
		return null;
	}
	return {
		limit,
		remaining,
		resetAt,
		retryAfterSeconds,
		scope,
		source: 'headers',
	};
};

const extractRequestId = (headers: {
	get(name: string): string | null;
}): string | null =>
	header(headers, 'x-request-id') ??
	header(headers, 'x-github-request-id') ??
	header(headers, 'x-amzn-requestid');

const buildUrl = (
	baseUrl: string,
	path: string,
	query: IGitHubHttpRequestOptions<unknown>['query'],
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

const isAbortLike = (error: unknown): boolean => {
	if (!(error instanceof Error) && typeof error !== 'object') return false;
	const name =
		typeof error === 'object' && error !== null
			? (error as { name?: unknown }).name
			: undefined;
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'object' && error !== null && 'message' in error
				? String((error as { message: unknown }).message)
				: '';
	return name === 'AbortError' || /timeout|aborted/i.test(message);
};

const createThrownError = (
	provider: RemoteProviderId,
	error: unknown,
	token: string,
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
	const sanitizedMessage = redactToken(message, token);
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
		details: { cause: sanitizedMessage },
	});
};

const createHttpError = (
	provider: RemoteProviderId,
	response: IRemoteFetchResponse,
	body: string,
	token: string,
): IRemoteProviderError => {
	const requestId = extractRequestId(response.headers);
	const retryAfterSeconds = parseNumber(
		header(response.headers, 'retry-after'),
	);
	const sanitizedBody = redactToken(body, token);
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
		...(sanitizedBody === ''
			? {}
			: { details: { bodySample: sanitizedBody.slice(0, 200) } }),
	});
};

export class GitHubRequestError extends Error implements IRemoteProviderError {
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
		this.name = 'GitHubRequestError';
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
	request: IGitHubHttpRequestOptions<TResponse>,
): Promise<TResponse> => {
	if (request.parseAs === 'text') {
		return (await response.text()) as TResponse;
	}
	const text = await response.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new GitHubRequestError({
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
		throw new GitHubRequestError({
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
		throw new GitHubRequestError({
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

export const createGitHubHttpClient = (
	options: IGitHubHttpClientOptions,
	deps: IGitHubHttpClientDeps,
): {
	readonly request: <TResponse>(
		request: IGitHubHttpRequestOptions<TResponse>,
	) => Promise<IRemoteProviderSuccess<TResponse>>;
} => {
	const now = deps.now ?? Date.now;
	const sleep =
		deps.sleep ??
		((ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const createAbortController =
		deps.createAbortController ?? (() => new AbortController());
	const setTimeoutFn: NonNullable<IGitHubHttpClientDeps['setTimeoutFn']> =
		deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
	const clearTimeoutFn: NonNullable<IGitHubHttpClientDeps['clearTimeoutFn']> =
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
			request: IGitHubHttpRequestOptions<TResponse>,
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
					clearTimeoutFn(timeoutHandle);
					if (!response.ok) {
						const body = await response.text();
						const normalized = createHttpError(
							'github',
							response,
							body,
							options.context.token,
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
						throw new GitHubRequestError(normalized);
					}
					const data = await parseResponseBody(
						'github',
						response,
						request,
					);
					const finishedAt = now();
					return {
						ok: true,
						provider: 'github',
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
						error instanceof GitHubRequestError
							? error.remoteError
							: createThrownError(
									'github',
									error,
									options.context.token,
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
					throw error instanceof GitHubRequestError
						? error
						: new GitHubRequestError(normalized);
				}
			}
		},
	};
};
