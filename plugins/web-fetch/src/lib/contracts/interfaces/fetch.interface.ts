/**
 * fetch.interface.ts — the web-fetch engine's data contracts (x00097 S4).
 *
 * Extracted from the engine so the streaming-capable fetcher seam is a
 * named contract: `IFetchLike` now exposes the standard `body` stream,
 * which is what lets the engine cap responses in REAL bytes while the
 * download is still in flight (and cancel the rest) instead of buffering
 * the whole payload and slicing UTF-16 units after the fact.
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
	/** Response cap in bytes — real octets, not UTF-16 units. Default 50 KiB. */
	readonly maxBytes?: number;
	/** Per-request timeout in ms — covers the BODY read too. Default 8000. */
	readonly timeoutMs?: number;
	/** Max redirect hops followed manually. Default 5. */
	readonly maxRedirects?: number;
}

/**
 * The numeric options after `sanitizeBounds` has coerced them into
 * guaranteed-safe ranges (a00065 S6): invalid/non-finite → the safe
 * default, above-ceiling → clamped. Never contains `undefined`, `0`,
 * negatives, `NaN` or `Infinity`.
 */
export interface ISanitizedBounds {
	readonly maxBytes: number;
	readonly timeoutMs: number;
	readonly maxRedirects: number;
}

/**
 * Injectable fetcher so tests never hit the real network. `body` follows
 * the WHATWG fetch shape: when a fetcher provides it, the engine streams
 * and cancels past the cap; a body-less test double falls back to
 * `text()` (still capped in real bytes, just without early cancel).
 */
export type IFetchLike = (
	url: string,
	init?: { readonly signal?: AbortSignal; readonly redirect?: 'manual' },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	readonly body?: ReadableStream<Uint8Array> | null;
	text(): Promise<string>;
}>;
