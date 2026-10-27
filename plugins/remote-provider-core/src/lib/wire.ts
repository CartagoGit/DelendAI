/**
 * wire.ts — the HTTP wire helpers every remote-provider client shares:
 * retry/timeout defaults, response-header parsing (pagination, rate limit,
 * request id) and abort detection. The github and gitlab clients differ in
 * their error mapping and body reading; these parts never differed.
 */
import type {
	IRemotePaginationMeta,
	IRemoteRateLimitMeta,
} from '@delendai/contracts/remote-provider';

export const DEFAULT_TIMEOUT_MS = 15_000;

export const DEFAULT_MAX_RETRIES = 2;

export const DEFAULT_RETRY_DELAY_MS = 250;

export const retryableStatuses = new Set([408, 425, 500, 502, 503, 504]);

export const compatibilityHint =
	/(unsupported|deprecated api|unsupported api|preview|incompatible|unknown version)/i;

export const transientHint =
	/(econnreset|econnrefused|eai_again|enotfound|network|socket|fetch failed|temporar)/i;

export const header = (
	headers: { get(name: string): string | null },
	name: string,
): string | null => headers.get(name) ?? headers.get(name.toLowerCase());

export const parseNumber = (raw: string | null): number | null => {
	if (raw === null) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
};

export const unixSecondsToIso = (raw: string | null): string | null => {
	const seconds = parseNumber(raw);
	if (seconds === null) return null;
	return new Date(seconds * 1000).toISOString();
};

export const parseLinkRelation = (
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

export const parsePaginationMeta = (headers: {
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

export const parseRateLimitMeta = (headers: {
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

export const extractRequestId = (headers: {
	get(name: string): string | null;
}): string | null =>
	header(headers, 'x-request-id') ??
	header(headers, 'x-github-request-id') ??
	header(headers, 'x-amzn-requestid');

export const isAbortLike = (error: unknown): boolean => {
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
