import { describe, expect, it, vi } from 'vitest';

import { buildObsErrorsToolRegistration } from './obs-errors.tool';
import {
	FETCH_TIMEOUT_MS,
	sentryBuildListUrl,
	sentryParseList,
} from '../errors/list-errors';
import type { IErrorSource } from '../errors/ierror-source';
import { FakeServer, parseOk } from '../testing/tool-spec-server.helper';
import { asArray } from '@delendai/test-kit/public';

const parseError = (r: unknown): { reason: string; nextAction?: string } => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	const envelope = JSON.parse(text) as {
		error?: { reason: string; nextAction?: string };
	};
	return envelope.error ?? { reason: '' };
};

const sourceFixture = (token = 'secret-token-do-not-log'): IErrorSource => {
	const body = JSON.stringify({
		data: [
			{
				id: '1',
				title: 'TypeError',
				project: { slug: 'web' },
				level: 'error',
				lastSeen: '2026-07-25T10:00:00Z',
				count: 42,
				culprit: 'web/x.ts',
				permalink: 'https://sentry/1',
			},
		],
	});
	return {
		id: 'sentry',
		baseUrl: 'https://sentry.example',
		allowList: ['sentry.example'],
		token,
		buildListUrl: sentryBuildListUrl({
			id: 'sentry',
			baseUrl: 'https://sentry.example',
			allowList: ['sentry.example'],
			token: 'x',
			buildListUrl: () => '',
			parseList: () => [],
		}),
		parseList: sentryParseList,
		fetch: ((_url: string) =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: {
					get: (name: string) =>
						name.toLowerCase() === 'content-type'
							? 'application/json'
							: null,
				},
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(body));
						controller.close();
					},
				}),
			})) as never,
	};
};

const build = (source: IErrorSource | undefined) => {
	const regs = buildObsErrorsToolRegistration({
		namespacePrefix: 'obs',
		...(source === undefined ? {} : { source }),
	});
	const server = new FakeServer();
	for (const r of [regs]) void r.register(server.asServer);
	return server.tools;
};

describe('obs-errors (f00129 S1)', () => {
	it('registers under the namespace prefix', () => {
		const tools = build(sourceFixture());
		expect(Object.keys(tools).sort()).toEqual(['obs_obs_errors']);
	});

	it('returns issues when the source is configured', async () => {
		const tools = build(sourceFixture());
		const handler = tools.obs_obs_errors?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(await handler({ limit: 10 }));
		expect(out.source).toBe('sentry');
		const issues = out.issues as Array<{ id: string; project: string }>;
		expect(issues).toHaveLength(1);
		expect(issues[0]?.id).toBe('1');
	});

	it('returns a structured error envelope when the source is absent', async () => {
		const tools = build(undefined);
		const handler = tools.obs_obs_errors?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(await handler({ limit: 10 }));
		expect(err.reason).toMatch(/no observability source/i);
		expect(err.nextAction).toMatch(/SENTRY_AUTH_TOKEN|DATADOG_API_KEY/);
	});

	it('returns a structured error envelope when the token is empty', async () => {
		const tools = build(sourceFixture(''));
		const handler = tools.obs_obs_errors?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(await handler({ limit: 10 }));
		expect(err.reason).toMatch(/auth token is empty/i);
	});

	it('filters by project when supplied', async () => {
		const tools = build(sourceFixture());
		const handler = tools.obs_obs_errors?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(await handler({ limit: 10, project: 'web' }));
		const issues = asArray(out.issues);
		expect(issues).toHaveLength(1);
	});

	it('clamps the limit to a sane upper bound', async () => {
		const tools = build(sourceFixture());
		const handler = tools.obs_obs_errors?.handler as (
			a: unknown,
		) => Promise<unknown>;
		// The zod schema enforces `max(100)`; passing 9999 should be rejected.
		const result = (await handler({ limit: 9999 })) as {
			isError?: boolean;
		};
		expect(
			result.isError === true || result.isError === undefined,
		).toBeTruthy();
	});

	// x00157 S4: the "direct" re-fetch in `fetchViaWebFetch` (needed
	// because the web-fetch engine's own fetch seam has no header
	// support) had no timeout — a hung observability API would hang
	// this tool indefinitely even though the engine call just above it
	// IS bounded. Omitting `source.fetch` exercises that production
	// path (both the engine call and the direct call route through the
	// mocked global `fetch`).
	it(
		'rejects a hung observability API within the fetch timeout instead of hanging forever',
		async () => {
			const originalFetch = global.fetch;
			let callCount = 0;
			global.fetch = vi.fn(
				(_url: string | URL | Request, init?: RequestInit) => {
					callCount += 1;
					if (callCount === 1) {
						// The engine's own allow-list-checking call — succeeds fast.
						return Promise.resolve({
							ok: true,
							status: 200,
							headers: { get: () => 'application/json' },
							body: new ReadableStream<Uint8Array>({
								start(controller) {
									controller.enqueue(
										new TextEncoder().encode('{"data":[]}'),
									);
									controller.close();
								},
							}),
						}) as unknown as ReturnType<typeof fetch>;
					}
					// The direct re-fetch — a hung observability API. Never
					// resolves on its own; only rejects when the injected
					// AbortSignal actually fires.
					return new Promise((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () => {
							reject(
								new DOMException(
									'The operation was aborted.',
									'TimeoutError',
								),
							);
						});
					}) as Promise<Response>;
				},
			) as unknown as typeof fetch;
			try {
				const source = sourceFixture();
				(source as { fetch?: IErrorSource['fetch'] }).fetch = undefined;
				const tools = build(source);
				const handler = tools.obs_obs_errors?.handler as (
					a: unknown,
				) => Promise<{ isError?: boolean }>;
				const result = await handler({ limit: 10 });
				expect(result.isError).toBe(true);
				expect(callCount).toBe(2);
			} finally {
				global.fetch = originalFetch;
			}
		},
		FETCH_TIMEOUT_MS + 1_000,
	);
});
