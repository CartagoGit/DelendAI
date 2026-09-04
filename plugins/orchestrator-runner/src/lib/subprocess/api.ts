/**
 * api.ts — HTTP provider invocation (S6).
 *
 * An `api` provider is reached over HTTP with a key from the environment.
 * The request is made through an INJECTED fetch seam so tests never touch
 * the network. Cancellation (CRITICAL I8) aborts the in-flight fetch via an
 * `AbortController` — the upstream spend is NOT refundable, so aborting is
 * best-effort damage control, not a rollback.
 *
 * Rate-limit response headers feed S5's 3-source quota merge: the parser
 * turns `x-ratelimit-*` / `retry-after` headers into an `httpHeaderSample`
 * the caller can hand to `writeQuotaSnapshot`.
 */
import { rewriteUnicodeForAgent } from '@delendai/core/public';

import {
	httpHeaderSample,
	type IProviderQuotaSample,
	type QuotaWindow,
} from '../quota';
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from '../invoke/types';

/** Minimal structural view of a fetch Response the invoker needs. */
export interface IHttpResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
}

/** Injected fetch seam. Default wires the global `fetch`. */
export type HttpFetch = (
	url: string,
	init: {
		readonly method: string;
		readonly headers: Readonly<Record<string, string>>;
		readonly body?: string;
		readonly signal: AbortSignal;
	},
) => Promise<IHttpResponse>;

/** Where a header-derived quota sample is delivered (S5 merge sink). */
export type QuotaSink = (sample: IProviderQuotaSample) => void;

export interface IApiInvokerOptions {
	readonly fetchFn: HttpFetch;
	/** Reads the provider key from the env var named on the decision. */
	readonly readEnv?: (name: string) => string | undefined;
	/** Optional sink for header-derived quota samples. */
	readonly quotaSink?: QuotaSink;
	/** The rate-limit window the provider's headers describe. Default hourly. */
	readonly quotaWindow?: QuotaWindow;
}

/**
 * Parse rate-limit headers into a quota sample. Missing headers yield a
 * sample with `null` fields (still valid — the merge tolerates unknowns).
 */
export const parseRateLimitHeaders = (
	providerId: string,
	headers: { get(name: string): string | null },
	window: QuotaWindow,
	now: Date = new Date(),
): IProviderQuotaSample => {
	const num = (name: string): number | null => {
		const raw = headers.get(name);
		if (raw === null) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	};
	return httpHeaderSample(providerId, {
		window,
		limit: num('x-ratelimit-limit'),
		remaining: num('x-ratelimit-remaining'),
		resetSeconds: num('retry-after') ?? num('x-ratelimit-reset'),
		now,
	});
};

export const createApiInvoker = (options: IApiInvokerOptions): IKindInvoker => {
	const readEnv = options.readEnv ?? ((name) => process.env[name]);
	const window: QuotaWindow = options.quotaWindow ?? 'hourly';

	return {
		start(request: IInvokeRequest): IActiveInvocation {
			if (request.invoke.kind !== 'api') {
				return {
					promise: Promise.reject(
						new Error(
							`api invoker got a ${request.invoke.kind} decision`,
						),
					),
					cancel: () => undefined,
				};
			}
			const invoke = request.invoke;
			const controller = new AbortController();
			const key = readEnv(invoke.envVar);

			const promise = (async (): Promise<IInvokeResult> => {
				if (key === undefined || key.length === 0) {
					throw new Error(
						`api provider missing env key ${invoke.envVar}`,
					);
				}
				const response = await options.fetchFn(invoke.url, {
					method: invoke.method ?? 'POST',
					headers: {
						authorization: `Bearer ${key}`,
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						prompt: rewriteUnicodeForAgent(request.prompt),
					}),
					signal: controller.signal,
				});
				// Feed the quota merge regardless of success (rate-limit
				// headers are most useful precisely on a 429).
				options.quotaSink?.(
					parseRateLimitHeaders(
						request.decision.targetProvider.id,
						response.headers,
						window,
					),
				);
				const text = await response.text();
				if (!response.ok) {
					throw new Error(`api responded ${response.status}`);
				}
				return { text };
			})();

			return {
				promise,
				cancel: () => controller.abort(),
			};
		},
	};
};
