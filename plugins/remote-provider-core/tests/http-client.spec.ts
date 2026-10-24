import z from 'zod';
import { describe, expect, it } from 'vitest';

import {
	resolveRemoteProviderConfig,
	createRemoteHttpClient,
	RemoteProviderRequestError,
	type IRemoteHttpClientDeps,
	type IRemoteFetchResponse,
	type RemoteFetchFn,
} from '../src';

const headersOf = (
	values: Readonly<Record<string, string>> = {},
): IRemoteFetchResponse['headers'] => ({
	get(name: string) {
		const found = Object.entries(values).find(
			([key]) => key.toLowerCase() === name.toLowerCase(),
		);
		return found?.[1] ?? null;
	},
});

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
): IRemoteFetchResponse => ({
	ok: status >= 200 && status < 300,
	status,
	headers: headersOf(headers),
	text: async () => body,
});

describe('resolveRemoteProviderConfig', () => {
	it('applies explicit precedence and keeps tokens in env-only sources', () => {
		const config = resolveRemoteProviderConfig({
			provider: 'github',
			env: {
				REMOTE_TOKEN: 'secret-token',
				REMOTE_BASE_URL: 'https://env.example/api/',
			},
			tokenEnvKeys: ['REMOTE_TOKEN'],
			defaultBaseUrl: 'https://default.example/api/',
			baseUrlEnvKey: 'REMOTE_BASE_URL',
			defaults: {
				timeoutMs: 2000,
				project: { owner: 'default-owner' },
			},
			pluginOptions: {
				baseUrl: 'https://plugin.example/api/',
				maxRetries: 4,
				project: { owner: 'plugin-owner', repository: 'plugin-repo' },
			},
			requestOverrides: {
				timeoutMs: 4000,
				project: { repository: 'override-repo' },
			},
			projectSchema: z
				.object({
					owner: z.string(),
					repository: z.string(),
				})
				.strict(),
		});

		expect(config.baseUrl).toBe('https://plugin.example/api/');
		expect(config.timeoutMs).toBe(4000);
		expect(config.maxRetries).toBe(4);
		expect(config.project).toEqual({
			owner: 'plugin-owner',
			repository: 'override-repo',
		});
		expect(config.sources.token).toBe('env:REMOTE_TOKEN');
		expect(config.sources.baseUrl).toBe('plugin');
		expect(config.sources.timeoutMs).toBe('override');
	});

	it('rejects missing tokens with an actionable message', () => {
		expect(() =>
			resolveRemoteProviderConfig({
				provider: 'gitlab',
				env: {},
				tokenEnvKeys: ['GITLAB_TOKEN'],
				defaultBaseUrl: 'https://gitlab.example/api/v4/',
			}),
		).toThrow(/GITLAB_TOKEN/);
	});
});

describe('createRemoteHttpClient', () => {
	it('returns pagination and rate-limit metadata for successful responses', async () => {
		const fetchFn: RemoteFetchFn = async () =>
			response(200, JSON.stringify({ items: ['a', 'b'] }), {
				'x-page': '2',
				'x-per-page': '20',
				'x-next-page': '3',
				'x-total': '45',
				'x-total-pages': '3',
				'x-ratelimit-limit': '5000',
				'x-ratelimit-remaining': '4999',
				'x-ratelimit-reset': '1788163200',
				'x-request-id': 'req-123',
			});

		const client = createRemoteHttpClient(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
			},
			{
				fetchFn,
				now: (() => {
					let tick = 0;
					return () => tick++;
				})(),
			},
		);

		const result = await client.request({
			path: '/issues',
			responseSchema: z.object({ items: z.array(z.string()) }).strict(),
		});

		expect(result.data.items).toEqual(['a', 'b']);
		expect(result.meta.requestId).toBe('req-123');
		expect(result.meta.pagination).toMatchObject({
			page: 2,
			perPage: 20,
			nextPage: '3',
			total: 45,
			totalPages: 3,
			hasMore: true,
		});
		expect(result.meta.rateLimit).toMatchObject({
			limit: 5000,
			remaining: 4999,
			source: 'headers',
		});
		expect(result.meta.attempts).toBe(1);
	});

	it('maps 401, 403, 404 and 429 to normalized errors', async () => {
		const statuses = [401, 403, 404, 429] as const;
		const expectedCodes = [
			'unauthorized',
			'forbidden',
			'not-found',
			'rate-limited',
		] as const;
		for (const [index, status] of statuses.entries()) {
			const client = createRemoteHttpClient(
				{
					provider: 'gitlab',
					baseUrl: 'https://gitlab.example/api/v4/',
					token: 'secret-token',
					maxRetries: 0,
				},
				{
					fetchFn: async () =>
						response(
							status,
							JSON.stringify({ message: 'failure' }),
							{
								'retry-after': '7',
							},
						),
				},
			);

			await expect(
				client.request({
					path: '/resource',
					responseSchema: z.object({}).strict(),
				}),
			).rejects.toMatchObject({
				code: expectedCodes[index],
				status,
			});
		}
	});

	it('maps timeouts through the injected abort path', async () => {
		const immediateTimeout: NonNullable<
			IRemoteHttpClientDeps['setTimeoutFn']
		> = (cb) => {
			queueMicrotask(cb);
			return 0;
		};
		const fetchFn: RemoteFetchFn = async (_url, init) =>
			new Promise((_resolve, reject) => {
				init.signal.addEventListener(
					'abort',
					() =>
						reject({
							name: 'AbortError',
							message: 'request aborted',
						}),
					{ once: true },
				);
			});

		const client = createRemoteHttpClient(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				timeoutMs: 1,
				maxRetries: 0,
			},
			{
				fetchFn,
				setTimeoutFn: immediateTimeout,
				clearTimeoutFn: () => undefined,
			},
		);

		await expect(
			client.request({
				path: '/slow',
				responseSchema: z.object({}).strict(),
			}),
		).rejects.toMatchObject({ code: 'timeout' });
	});

	it('retries transient responses with injectable backoff and reports attempts', async () => {
		const seenSleeps: number[] = [];
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			if (calls === 1) return response(502, 'temporary upstream failure');
			return response(200, JSON.stringify({ ok: true }));
		};

		const client = createRemoteHttpClient(
			{
				provider: 'gitlab',
				baseUrl: 'https://gitlab.example/api/v4/',
				token: 'secret-token',
				maxRetries: 1,
				backoffMs: () => 17,
			},
			{
				fetchFn,
				sleep: async (ms) => {
					seenSleeps.push(ms);
				},
			},
		);

		const result = await client.request({
			path: '/pipelines',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
		});

		expect(result.data.ok).toBe(true);
		expect(result.meta.attempts).toBe(2);
		expect(seenSleeps).toEqual([17]);
	});

	it('honors the exact additional retry limit', async () => {
		for (const maxRetries of [0, 1]) {
			let calls = 0;
			const client = createRemoteHttpClient(
				{
					provider: 'github',
					baseUrl: 'https://api.example/',
					token: 'secret-token',
					maxRetries,
				},
				{
					fetchFn: async () => {
						calls += 1;
						return response(502, 'temporary upstream failure');
					},
					sleep: async () => undefined,
				},
			);

			await expect(
				client.request({
					path: '/retry-limit',
					responseSchema: z.object({ ok: z.boolean() }).strict(),
				}),
			).rejects.toMatchObject({ code: 'transient' });
			expect(calls).toBe(maxRetries + 1);
		}
	});

	it('distinguishes API incompatibility from invalid response bodies', async () => {
		const incompatibleClient = createRemoteHttpClient(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				maxRetries: 0,
			},
			{
				fetchFn: async () =>
					response(200, JSON.stringify({ version: 'v1' })),
			},
		);

		await expect(
			incompatibleClient.request({
				path: '/compat',
				compatibilityCheck: () => 'github API preview is not enabled',
				responseSchema: z.object({ version: z.string() }).strict(),
			}),
		).rejects.toMatchObject({ code: 'api-incompatible' });

		const invalidClient = createRemoteHttpClient(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				maxRetries: 0,
			},
			{
				fetchFn: async () => response(200, 'not-json'),
			},
		);

		await expect(
			invalidClient.request({
				path: '/invalid',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toBeInstanceOf(RemoteProviderRequestError);
		await expect(
			invalidClient.request({
				path: '/invalid',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toMatchObject({ code: 'invalid-response' });
	});
});
