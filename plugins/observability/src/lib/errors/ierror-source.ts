/**
 * f00129 S1 — Error/issue source contract.
 *
 * Pure contract for a "remote error stream" (Sentry, Datadog, or any
 * compatible REST API). The plugin never imports a vendor SDK — it
 * declares the input shape (`IFetchLike` + a host allow-list) and lets
 * the host inject a real adapter. Tool logic is a pure formatter
 * over the normalized `IObsIssue` shape, so the same output can be
 * re-rendered for the CLI, the extension, or correlation with
 * local logs (S3).
 */
import type { IWebFetchResult } from '@delendai/web-fetch/public';

/** Minimal fetch-like seam — compatible with the global `fetch`. */
export type IFetchLike = (
	input: string,
	init?: { readonly signal?: AbortSignal },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	readonly body: ReadableStream<Uint8Array> | null;
}>;

/** Vendor-agnostic list of one issue. Normalized; ready for the CLI table. */
export interface IObsIssue {
	/** Vendor-issued id (Sentry id, Datadog case id). */
	readonly id: string;
	/** Short title. */
	readonly title: string;
	/** Project / service the issue belongs to. */
	readonly project: string;
	/** Severity / level reported by the vendor. */
	readonly level:
		| 'fatal'
		| 'error'
		| 'warning'
		| 'info'
		| 'debug'
		| 'unknown';
	/** ISO 8601 last-seen timestamp. */
	readonly lastSeen: string;
	/** Number of events. */
	readonly eventCount: number;
	/** Truncated stack/context snippet (already redacted). */
	readonly context: string;
	/** Direct vendor URL. */
	readonly url: string;
}

/** Injected source for listing recent issues. Pure formatter over it. */
export interface IErrorSource {
	/** Provider id (used in tool output + logs; never carries a token). */
	readonly id: 'sentry' | 'datadog' | 'custom';
	/** Vendor base URL (e.g. `https://oXXXXXX.ingest.sentry.io`). */
	readonly baseUrl: string;
	/** Hostnames the underlying `webFetch` allows for this source. */
	readonly allowList: readonly string[];
	/** Auth token (token presence is checked, but the value is never logged). */
	readonly token: string;
	/**
	 * Build the URL for the vendor's "list issues" endpoint given a
	 * cursor + a per-page size. Pure; deterministic.
	 */
	readonly buildListUrl: (input: {
		cursor?: string;
		limit: number;
	}) => string;
	/**
	 * Map the vendor's raw response (already redacted of any token
	 * leak) into the vendor-agnostic `IObsIssue[]`. Pure.
	 */
	readonly parseList: (body: string) => readonly IObsIssue[];
	/**
	 * The web-fetch engine to use. Injected so the test can swap a
	 * stub. Defaults to the shared `webFetch` when omitted.
	 */
	readonly fetch?: IFetchLike;
}

/** Tool-level input (after zod validation). */
export interface IListErrorsInput {
	readonly project?: string;
	readonly level?: IObsIssue['level'];
	readonly cursor?: string;
	readonly limit: number;
}

/** Output of {@link listRecentErrors}. */
export interface IListErrorsOutput {
	readonly source: IErrorSource['id'];
	readonly issues: readonly IObsIssue[];
	readonly nextCursor: string | null;
	readonly redactions: number;
}

/**
 * Build the `Authorization` header the vendor expects. Pure data;
 * never logged.
 */
export const authHeaderFor = (
	source: IErrorSource,
): { name: string; value: string } => {
	switch (source.id) {
		case 'sentry':
			return { name: 'Authorization', value: `Bearer ${source.token}` };
		case 'datadog':
			return { name: 'DD-API-KEY', value: source.token };
		case 'custom':
			return { name: 'Authorization', value: `Bearer ${source.token}` };
	}
};

/** Strip the token from any string before it can be logged. Defensive. */
export const redactToken = (input: string, token: string): string =>
	token.length === 0 ? input : input.split(token).join('[REDACTED]');

/**
 * Shared bound for every fetch this plugin issues. Exported so
 * `list-errors.ts`'s own direct fetch can use the same constant instead
 * of a second hardcoded value.
 */
export const FETCH_TIMEOUT_MS = 8_000;

/** x00185 (F12): thrown when a response body stalls past FETCH_TIMEOUT_MS. */
export class BodyReadTimeoutError extends Error {
	constructor(url: string) {
		super(`body read timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`);
		this.name = 'BodyReadTimeoutError';
	}
}

/**
 * The shared fetch seam. The default reads from the `IErrorSource.fetch`
 * and falls back to the global `fetch`. Pure dispatcher.
 */
export const dispatchFetch = async (
	source: IErrorSource,
	url: string,
): Promise<IWebFetchResult> => {
	const f = source.fetch ?? (fetch as unknown as IFetchLike);
	// We delegate the *actual* IWebFetchResult shaping to the engine when
	// it is reachable; the host is expected to wire that here. In tests,
	// the source provides a `fetch` and the caller wraps it. This shim
	// keeps the public surface tiny.
	const _headers: Record<string, string> = {
		Accept: 'application/json',
		[authHeaderFor(source).name]: authHeaderFor(source).value,
	};
	// x00157-adjacent finding (2026-07-28): this call had NO signal at
	// all — a hung `source.fetch` (a host-injected adapter) or a
	// server that opens the connection and never sends a body would
	// hang this dispatcher, and the unbounded `reader.read()` loop
	// below, forever. `IFetchLike`'s contract already declares an
	// optional `signal`; every caller (real fetch, or a compliant
	// injected adapter) is expected to honor it.
	const res = await f(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	const ok = res.ok;
	const contentType = res.headers.get('content-type');
	const status = res.status;
	const body = res.body;
	if (body === null) {
		return ok
			? {
					ok: true,
					url,
					status,
					contentType,
					body: '',
					truncated: false,
				}
			: { ok: false, reason: 'fetch-error' as const };
	}
	const reader = body.getReader();
	const decoder = new TextDecoder('utf-8');
	let out = '';
	// x00185 (F12): the signal above only bounds the INITIAL connection —
	// a server that sends headers and then never completes the body (or
	// drips it arbitrarily slowly) hung this loop forever, blocking the
	// whole MCP tool call. Each read now races against its own timeout;
	// on expiry the reader is cancelled and a typed error is thrown
	// instead of hanging.
	const bodyTimeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
	const bodyTimeout = new Promise<never>((_, reject) => {
		bodyTimeoutSignal.addEventListener(
			'abort',
			() => reject(new BodyReadTimeoutError(url)),
			{ once: true },
		);
	});
	try {
		while (true) {
			const { done, value } = await Promise.race([
				reader.read(),
				bodyTimeout,
			]);
			if (done) break;
			if (value !== undefined)
				out += decoder.decode(value, { stream: true });
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		throw error;
	}
	out += decoder.decode();
	return {
		ok: true,
		url,
		status,
		contentType,
		body: out,
		truncated: false,
	};
};
