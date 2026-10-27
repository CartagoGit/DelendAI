import type {
	IRemoteProviderError,
	IRemoteProviderSuccess,
	IRemoteResponseMeta,
	RemoteProviderErrorCode,
	RemoteProviderId,
} from '@delendai/contracts/remote-provider';
import type z from 'zod';
import {
	DEFAULT_TIMEOUT_MS,
	DEFAULT_MAX_RETRIES,
	DEFAULT_RETRY_DELAY_MS,
	retryableStatuses,
	compatibilityHint,
	transientHint,
} from './contracts/constants/wire.constant';
import {
	header,
	parseNumber,
	parsePaginationMeta,
	parseRateLimitMeta,
	extractRequestId,
	isAbortLike,
} from './wire.helper';

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

export interface IAbortControllerLike {
	readonly signal: AbortSignal;
	abort(reason?: unknown): void;
}

export interface IRemoteHttpClientDeps {
	readonly fetchFn: RemoteFetchFn;
	readonly now?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly createAbortController?: () => IAbortControllerLike;
	readonly setTimeoutFn?: (cb: () => void, ms: number) => unknown;
	readonly clearTimeoutFn?: (handle: unknown) => void;
}

export interface IRemoteHttpClientOptions {
	readonly provider: RemoteProviderId;
	readonly baseUrl: string;
	readonly token: string;
	readonly timeoutMs?: number;
	readonly maxRetries?: number;
	readonly retryBaseDelayMs?: number;
	readonly defaultHeaders?: Readonly<Record<string, string>>;
	readonly userAgent?: string;
	readonly backoffMs?: (
		attempt: number,
		error: IRemoteProviderError,
	) => number;
}

export interface IRemoteHttpRequestOptions<TResponse> {
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

const isSafeRetryMethod = (method: string): boolean => {
	const normalized = method.toUpperCase();
	return (
		normalized === 'GET' ||
		normalized === 'HEAD' ||
		normalized === 'OPTIONS'
	);
};

const buildUrl = (
	provider: RemoteProviderId,
	baseUrl: string,
	path: string,
	query: IRemoteHttpRequestOptions<unknown>['query'],
): string => {
	const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
	// `/issues` is under the base, not at the origin's root: resolved as
	// given it dropped a base path such as `/api/v4/`. A `//host` stays
	// as it is, and is refused below.
	const relative = /^\/(?!\/)/u.test(path) ? path.slice(1) : path;
	const url = new URL(relative, base);
	if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
		throw new RemoteProviderRequestError({
			code: 'invalid-config',
			provider,
			message: `${provider} request path leaves ${base.origin}${base.pathname}; the token is never sent outside its base`,
			status: null,
			requestId: null,
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
		});
	}
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

export class RemoteProviderRequestError
	extends Error
	implements IRemoteProviderError
{
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
		this.name = 'RemoteProviderRequestError';
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
	request: IRemoteHttpRequestOptions<TResponse>,
): Promise<TResponse> => {
	if (request.parseAs === 'text') {
		return (await response.text()) as TResponse;
	}
	const text = await response.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new RemoteProviderRequestError({
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
		throw new RemoteProviderRequestError({
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
		throw new RemoteProviderRequestError({
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

export const createRemoteHttpClient = (
	options: IRemoteHttpClientOptions,
	deps: IRemoteHttpClientDeps,
): {
	readonly request: <TResponse>(
		request: IRemoteHttpRequestOptions<TResponse>,
	) => Promise<IRemoteProviderSuccess<TResponse>>;
} => {
	const now = deps.now ?? Date.now;
	const sleep =
		deps.sleep ??
		((ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const createAbortController =
		deps.createAbortController ?? (() => new AbortController());
	const setTimeoutFn: NonNullable<IRemoteHttpClientDeps['setTimeoutFn']> =
		deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
	const clearTimeoutFn: NonNullable<IRemoteHttpClientDeps['clearTimeoutFn']> =
		deps.clearTimeoutFn ??
		((handle) => {
			clearTimeout(
				handle as number | ReturnType<typeof globalThis.setTimeout>,
			);
		});
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	const backoffMs =
		options.backoffMs ??
		((attempt: number) => retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));

	return {
		async request<TResponse>(
			request: IRemoteHttpRequestOptions<TResponse>,
		): Promise<IRemoteProviderSuccess<TResponse>> {
			const method = request.method?.toUpperCase() ?? 'GET';
			const url = buildUrl(
				options.provider,
				options.baseUrl,
				request.path,
				request.query,
			);
			const headers: Record<string, string> = {
				accept: 'application/json',
				authorization: `Bearer ${options.token}`,
				...options.defaultHeaders,
				...request.headers,
			};
			if (options.userAgent !== undefined)
				headers['user-agent'] = options.userAgent;

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
							options.provider,
							response,
							body,
						);
						if (
							normalized.retryable &&
							attempts <= maxRetries &&
							isSafeRetryMethod(method)
						) {
							await sleep(backoffMs(attempts, normalized));
							continue;
						}
						throw new RemoteProviderRequestError(normalized);
					}
					const data = await parseResponseBody(
						options.provider,
						response,
						request,
					);
					const finishedAt = now();
					return {
						ok: true,
						provider: options.provider,
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
						error instanceof RemoteProviderRequestError
							? error.remoteError
							: createThrownError(options.provider, error);
					if (
						normalized.retryable &&
						attempts <= maxRetries &&
						isSafeRetryMethod(method)
					) {
						await sleep(backoffMs(attempts, normalized));
						continue;
					}
					throw error instanceof RemoteProviderRequestError
						? error
						: new RemoteProviderRequestError(normalized);
				}
			}
		},
	};
};
