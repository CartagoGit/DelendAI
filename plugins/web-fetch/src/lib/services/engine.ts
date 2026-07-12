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
 * - Response size is capped at `maxBytes` (default 50 KiB) **while
 *   streaming** (x00097 S4, audit a00052 #14): the cap counts real octets,
 *   the reader is cancelled the moment it is crossed (memory stays
 *   bounded, the download stops), and a `TextDecoder` decodes
 *   incrementally so multi-byte UTF-8 sequences split across chunk — or
 *   cap — boundaries never corrupt the text.
 */
import type {
	IFetchLike,
	IWebFetchOptions,
	IWebFetchResult,
} from '../contracts/interfaces/fetch.interface';

export type {
	IFetchLike,
	IWebFetchFailure,
	IWebFetchOptions,
	IWebFetchReason,
	IWebFetchResult,
	IWebFetchSuccess,
} from '../contracts/interfaces/fetch.interface';

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
 * Consume a response body up to `maxBytes` REAL bytes. Streams when the
 * fetcher exposes `body`, cancelling the reader as soon as the cap is
 * crossed; falls back to `text()` for body-less fetchers (test doubles) —
 * still capped in octets via an encode/slice round-trip. The incremental
 * decoder replaces a cap-split multi-byte sequence with U+FFFD instead of
 * emitting garbage.
 */
const readBodyCapped = async (
	res: Awaited<ReturnType<IFetchLike>>,
	maxBytes: number,
): Promise<{ body: string; truncated: boolean }> => {
	const stream = res.body;
	if (stream === undefined || stream === null) {
		const raw = await res.text();
		const bytes = new TextEncoder().encode(raw);
		if (bytes.byteLength <= maxBytes) {
			return { body: raw, truncated: false };
		}
		return {
			body: new TextDecoder('utf-8').decode(bytes.subarray(0, maxBytes)),
			truncated: true,
		};
	}

	const reader = stream.getReader();
	const decoder = new TextDecoder('utf-8');
	let received = 0;
	let out = '';
	let truncated = false;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined || value.byteLength === 0) continue;
			const remaining = maxBytes - received;
			if (value.byteLength <= remaining) {
				received += value.byteLength;
				out += decoder.decode(value, { stream: true });
				continue;
			}
			// Cap crossed mid-chunk: keep the fitting prefix, stop the
			// download — the cancel is the memory/bandwidth bound.
			out += decoder.decode(value.subarray(0, remaining), {
				stream: true,
			});
			received = maxBytes;
			truncated = true;
			await reader.cancel();
			break;
		}
	} finally {
		reader.releaseLock();
	}
	out += decoder.decode(); // flush a trailing partial sequence (U+FFFD)
	return { body: out, truncated };
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

		// Manual redirect handling: re-validate the Location host before
		// following it, instead of letting `fetch` auto-follow blindly.
		if (res.status >= 300 && res.status < 400) {
			clearTimeout(timer);
			// Free the hop's connection; its body is never read.
			void res.body?.cancel().catch(() => undefined);
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
		// x00097 S4: the abort timer stays armed through the BODY read — a
		// server that returns headers fast and then trickles the body used
		// to hang past the declared timeout.
		let capped: { body: string; truncated: boolean };
		try {
			capped = await readBodyCapped(res, maxBytes);
		} catch (err) {
			const isAbort = err instanceof Error && err.name === 'AbortError';
			return {
				ok: false,
				reason: isAbort ? 'timeout' : 'fetch-error',
				detail: String(err),
			};
		} finally {
			clearTimeout(timer);
		}
		return {
			ok: true,
			url: currentUrl.toString(),
			status: res.status,
			contentType,
			body: capped.body,
			truncated: capped.truncated,
		};
	}

	return {
		ok: false,
		reason: 'too-many-redirects',
		detail: `> ${maxRedirects} hops`,
	};
};
