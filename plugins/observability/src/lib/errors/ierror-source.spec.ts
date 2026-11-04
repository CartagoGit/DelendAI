import { describe, expect, it, vi } from 'vitest';

import {
	authHeaderFor,
	dispatchFetch,
	FETCH_TIMEOUT_MS,
	redactToken,
} from './ierror-source';
import type { IErrorSource } from './ierror-source';

const baseSource = (overrides: Partial<IErrorSource> = {}): IErrorSource => ({
	id: 'sentry',
	baseUrl: 'https://sentry.example',
	allowList: ['sentry.example'],
	token: 'secret-token',
	buildListUrl: () => 'https://sentry.example/api/0/projects/',
	parseList: () => [],
	...overrides,
});

describe('authHeaderFor', () => {
	it('builds the Sentry bearer header', () => {
		expect(authHeaderFor(baseSource({ id: 'sentry' }))).toEqual({
			name: 'Authorization',
			value: 'Bearer secret-token',
		});
	});

	it('builds the Datadog API-key header', () => {
		expect(authHeaderFor(baseSource({ id: 'datadog' }))).toEqual({
			name: 'DD-API-KEY',
			value: 'secret-token',
		});
	});
});

describe('redactToken', () => {
	it('strips every occurrence of the token', () => {
		expect(
			redactToken('a secret-token b secret-token c', 'secret-token'),
		).toBe('a [REDACTED] b [REDACTED] c');
	});

	it('passes text through unchanged when the token is empty', () => {
		expect(redactToken('nothing to redact', '')).toBe('nothing to redact');
	});
});

describe('dispatchFetch', () => {
	it('reads a streamed body through the injected fetch seam', async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"data":[]}'));
				controller.close();
			},
		});
		const source = baseSource({
			fetch: (() =>
				Promise.resolve({
					ok: true,
					status: 200,
					headers: { get: () => 'application/json' },
					body,
				})) as never,
		});
		const result = await dispatchFetch(source, 'https://sentry.example/x');
		expect(result).toMatchObject({
			ok: true,
			status: 200,
			body: '{"data":[]}',
		});
	});

	// a00084 (2026-07-28): dispatchFetch's fetch call had NO signal at
	// all, and the body-read loop below it was unbounded — a hung
	// source.fetch (a host-injected adapter, or the global fetch
	// fallback against a server that opens the connection and never
	// sends anything) would hang this dispatcher forever.
	it(
		'aborts a hanging source instead of hanging forever',
		async () => {
			const source = baseSource({
				fetch: ((_url: string, init?: { signal?: AbortSignal }) =>
					new Promise((_resolve, reject) => {
						// Never resolves on its own — a real hung source.
						// Only settles when the injected AbortSignal fires,
						// exactly like a real hung `fetch` does.
						init?.signal?.addEventListener('abort', () => {
							reject(
								new DOMException(
									'The operation was aborted.',
									'TimeoutError',
								),
							);
						});
					})) as never,
			});
			await expect(
				dispatchFetch(source, 'https://sentry.example/x'),
			).rejects.toThrow();
		},
		FETCH_TIMEOUT_MS + 500,
	);

	// x00185 (F12): the signal above only bounded the INITIAL fetch call
	// — a server that sends headers and then never completes the body
	// (or drips it arbitrarily slowly) hung the reader.read() loop
	// forever, since nothing tied it to a timeout of its own.
	it(
		'times out a body that stalls after headers arrive, instead of hanging forever',
		async () => {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"dat'));
					// Never closes and never enqueues again — a real
					// slow-drip / stalled body.
				},
			});
			const source = baseSource({
				fetch: (() =>
					Promise.resolve({
						ok: true,
						status: 200,
						headers: { get: () => 'application/json' },
						body,
					})) as never,
			});
			await expect(
				dispatchFetch(source, 'https://sentry.example/x'),
			).rejects.toThrow(/body read timed out/);
		},
		FETCH_TIMEOUT_MS + 500,
	);

	it('passes an AbortSignal to the injected fetch seam', async () => {
		const fetchSpy = vi.fn(
			(_url: string, _init?: { signal?: AbortSignal }) =>
				Promise.resolve({
					ok: true,
					status: 200,
					headers: { get: () => null },
					body: null,
				}),
		);
		const source = baseSource({ fetch: fetchSpy as never });
		await dispatchFetch(source, 'https://sentry.example/x');
		const init = fetchSpy.mock.calls[0]?.[1] as
			| { signal?: AbortSignal }
			| undefined;
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});
});
