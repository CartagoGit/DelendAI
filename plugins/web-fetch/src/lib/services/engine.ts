/**
 * `web` plugin engine: fetch one allow-listed URL and return capped text.
 *
 * Single Responsibility: this module only resolves "is this URL allowed,
 * and if so what comes back" — it knows nothing about MCP tool registration
 * (that's `tools.ts`) or about how the allow-list is read from config
 * (that's `index.ts`, which owns `ctx.options` parsing). Keeping the fetch
 * logic free of the MCP SDK means it is testable with a plain injected
 * fetcher and no server scaffolding.
 *
 * Security model (SSRF mitigation within scope — see plugin README for the
 * host-level concerns this does NOT cover):
 * - The allow-list is matched against the URL's **hostname**, exact match
 *   or `*.suffix` wildcard. An empty/missing allow-list means "fetch
 *   nothing" — the plugin fails closed, not open.
 * - Every redirect hop is followed manually (not via `fetch`'s automatic
 *   redirect) so each hop's target hostname is re-checked against the
 *   allow-list. A redirect to a non-allow-listed host is rejected, not
 *   silently followed — that is the documented mitigation for "allow-listed
 *   URL redirects to an internal/non-allow-listed host".
 * - Response size is capped at `maxBytes` (default 50 KiB); the body is
 *   truncated, never buffered beyond the cap.
 */

export type IWebFetchReason =
	| 'blocked-host'
	| 'invalid-url'
	| 'redirect-blocked'
	| 'too-many-redirects'
	| 'timeout'
	| 'fetch-error';

export interface IWebFetchSuccess {
	readonly ok: true;
	readonly url: string;
	readonly status: number;
	readonly contentType: string | null;
	readonly body: string;
	readonly truncated: boolean;
}

export interface IWebFetchFailure {
	readonly ok: false;
	readonly reason: IWebFetchReason;
	readonly detail?: string;
}

export type IWebFetchResult = IWebFetchSuccess | IWebFetchFailure;

export interface IWebFetchOptions {
	readonly url: string;
	/** Hostnames (exact or `*.suffix` wildcard) this call is allowed to reach. */
	readonly allowList: readonly string[];
	/** Response cap in bytes. Default 50 KiB. */
	readonly maxBytes?: number;
	/** Per-request timeout in ms. Default 8000. */
	readonly timeoutMs?: number;
	/** Max redirect hops followed manually. Default 5. */
	readonly maxRedirects?: number;
}

/** Injectable fetcher so tests never hit the real network. */
export type IFetchLike = (
	url: string,
	init?: { readonly signal?: AbortSignal; readonly redirect?: 'manual' },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
}>;

const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_REDIRECTS = 5;

/** True when `hostname` matches an allow-list entry (exact, or `*.suffix` wildcard). */
export const isHostAllowed = (
	hostname: string,
	allowList: readonly string[],
): boolean => {
	const lower = hostname.toLowerCase();
	return allowList.some((entry) => {
		const pattern = entry.toLowerCase();
		if (pattern.startsWith('*.')) {
			const suffix = pattern.slice(1); // keep the leading dot
			return lower.endsWith(suffix) && lower.length > suffix.length;
		}
		return lower === pattern;
	});
};

const parseUrl = (raw: string): URL | undefined => {
	try {
		const url = new URL(raw);
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url
			: undefined;
	} catch {
		return undefined;
	}
};

/**
 * Fetch one allow-listed URL, following redirects manually (re-checking the
 * allow-list at every hop) and capping the response body at `maxBytes`.
 * Never throws — every failure mode resolves to `{ ok: false, reason }`.
 */
export const webFetch = async (
	options: IWebFetchOptions,
	fetchImpl: IFetchLike = fetch as unknown as IFetchLike,
): Promise<IWebFetchResult> => {
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

	let currentUrl = parseUrl(options.url);
	if (currentUrl === undefined) {
		return { ok: false, reason: 'invalid-url', detail: options.url };
	}

	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		if (!isHostAllowed(currentUrl.hostname, options.allowList)) {
			return {
				ok: false,
				reason: hop === 0 ? 'blocked-host' : 'redirect-blocked',
				detail: currentUrl.hostname,
			};
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let res: Awaited<ReturnType<IFetchLike>>;
		try {
			res = await fetchImpl(currentUrl.toString(), {
				signal: controller.signal,
				redirect: 'manual',
			});
		} catch (err) {
			clearTimeout(timer);
			const isAbort = err instanceof Error && err.name === 'AbortError';
			return {
				ok: false,
				reason: isAbort ? 'timeout' : 'fetch-error',
				detail: String(err),
			};
		}
		clearTimeout(timer);

		// Manual redirect handling: re-validate the Location host before
		// following it, instead of letting `fetch` auto-follow blindly.
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (location === null) {
				return {
					ok: false,
					reason: 'fetch-error',
					detail: 'redirect with no Location header',
				};
			}
			const next = parseUrl(new URL(location, currentUrl).toString());
			if (next === undefined) {
				return { ok: false, reason: 'invalid-url', detail: location };
			}
			currentUrl = next;
			continue;
		}

		const contentType = res.headers.get('content-type');
		const raw = await res.text();
		const truncated = raw.length > maxBytes;
		const body = truncated ? raw.slice(0, maxBytes) : raw;
		return {
			ok: true,
			url: currentUrl.toString(),
			status: res.status,
			contentType,
			body,
			truncated,
		};
	}

	return {
		ok: false,
		reason: 'too-many-redirects',
		detail: `> ${maxRedirects} hops`,
	};
};
