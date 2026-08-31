import z from 'zod';
import { describe, expect, it } from 'vitest';

import {
	createGitHubHttpClient,
	type GitHubRequestError,
	type IRemoteFetchResponse,
} from '../../../src/lib/client';
import type { IGitHubProviderContext } from '../../../src/lib/config';

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
): IRemoteFetchResponse => ({
	ok: status >= 200 && status < 300,
	status,
	headers: {
		get(name: string) {
			const found = Object.entries(headers).find(
				([key]) => key.toLowerCase() === name.toLowerCase(),
			);
			return found?.[1] ?? null;
		},
	},
	text: async () => body,
});

const baseContext = (
	overrides: Partial<IGitHubProviderContext> = {},
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'ghs_test_secret_123',
	apiBaseUrl: 'https://api.github.com',
	webBaseUrl: 'https://github.com',
	host: 'github.com',
	repository: null,
	timeoutMs: 15_000,
	maxRetries: 2,
	retryBaseDelayMs: 250,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		repository: [],
	},
	...overrides,
});

describe('createGitHubHttpClient', () => {
	it('returns success metadata with pagination and rate limits on GitHub Enterprise', async () => {
		let seenUrl = '';
		const client = createGitHubHttpClient(
			{
				context: baseContext({
					apiBaseUrl: 'https://ghe.example/api/v3',
					webBaseUrl: 'https://ghe.example',
					host: 'ghe.example',
				}),
			},
			{
				fetchFn: async (url) => {
					seenUrl = url;
					return response(
						200,
						JSON.stringify({ items: [{ id: 1 }] }),
						{
							link: '<https://ghe.example/api/v3/search/repositories?page=3>; rel="next"',
							'x-page': '2',
							'x-per-page': '30',
							'x-ratelimit-limit': '5000',
							'x-ratelimit-remaining': '4999',
							'x-ratelimit-reset': '1788134400',
							'x-ratelimit-resource': 'core',
							'x-github-request-id': 'ghe-req-1',
						},
					);
				},
			},
		);

		const result = await client.request({
			path: '/search/repositories',
			query: { page: 2, per_page: 30, q: 'mcp-vertex' },
			responseSchema: z.object({ items: z.array(z.unknown()) }).strict(),
		});

		expect(seenUrl).toBe(
			'https://ghe.example/api/v3/search/repositories?page=2&per_page=30&q=mcp-vertex',
		);
		expect(result.data.items).toHaveLength(1);
		expect(result.meta.pagination).toMatchObject({
			page: 2,
			perPage: 30,
			nextPage: '3',
			hasMore: true,
		});
		expect(result.meta.rateLimit).toMatchObject({
			limit: 5000,
			remaining: 4999,
			scope: 'core',
		});
		expect(result.meta.requestId).toBe('ghe-req-1');
	});

	it('normalizes 401, 403, 404 and 429 without leaking the token', async () => {
		const cases = [
			{ status: 401, code: 'unauthorized', retryAfterSeconds: null },
			{ status: 403, code: 'forbidden', retryAfterSeconds: null },
			{ status: 404, code: 'not-found', retryAfterSeconds: null },
			{ status: 429, code: 'rate-limited', retryAfterSeconds: 42 },
		] as const;

		for (const testCase of cases) {
			const client = createGitHubHttpClient(
				{ context: baseContext() },
				{
					fetchFn: async () =>
						response(
							testCase.status,
							`echoed token ghs_test_secret_123 for status ${testCase.status}`,
							testCase.status === 429
								? {
										'retry-after': '42',
										'x-request-id': 'req-429',
									}
								: { 'x-request-id': `req-${testCase.status}` },
						),
				},
			);

			await expect(
				client.request({
					path: '/repos/acme/repo',
					responseSchema: z.any(),
				}),
			).rejects.toMatchObject({
				code: testCase.code,
				status: testCase.status,
				retryAfterSeconds: testCase.retryAfterSeconds,
			});

			try {
				await client.request({
					path: '/repos/acme/repo',
					responseSchema: z.any(),
				});
			} catch (error) {
				const remoteError = (error as GitHubRequestError).remoteError;
				expect(JSON.stringify(remoteError)).not.toContain(
					'ghs_test_secret_123',
				);
			}
		}
	});

	it('retries transient GET failures and returns the final success envelope', async () => {
		let attempts = 0;
		const sleeps: number[] = [];
		const client = createGitHubHttpClient(
			{ context: baseContext({ maxRetries: 2, retryBaseDelayMs: 250 }) },
			{
				fetchFn: async () => {
					attempts += 1;
					if (attempts === 1) {
						return response(503, 'temporary outage', {
							'x-request-id': 'req-retry-1',
						});
					}
					return response(200, JSON.stringify({ ok: true }), {
						'x-request-id': 'req-retry-2',
					});
				},
				sleep: async (ms) => {
					sleeps.push(ms);
				},
			},
		);

		const result = await client.request({
			path: '/repos/acme/repo',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
		});

		expect(result.data.ok).toBe(true);
		expect(result.meta.attempts).toBe(2);
		expect(attempts).toBe(2);
		expect(sleeps).toEqual([250]);
	});

	it('normalizes timeout failures as retryable without exposing credentials', async () => {
		const client = createGitHubHttpClient(
			{ context: baseContext() },
			{
				fetchFn: async () => {
					const error = new Error(
						'request aborted for ghs_test_secret_123',
					);
					error.name = 'AbortError';
					throw error;
				},
			},
		);

		await expect(
			client.request({
				path: '/repos/acme/repo',
				responseSchema: z.any(),
			}),
		).rejects.toMatchObject({
			code: 'timeout',
			retryable: true,
			temporary: true,
		});
	});

	it('rejects non-JSON and schema-invalid responses with invalid-response', async () => {
		const nonJsonClient = createGitHubHttpClient(
			{ context: baseContext() },
			{
				fetchFn: async () =>
					response(200, 'not-json', {
						'x-request-id': 'req-non-json',
					}),
			},
		);
		await expect(
			nonJsonClient.request({
				path: '/repos/acme/repo',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toMatchObject({
			code: 'invalid-response',
			message: 'github returned a non-JSON body',
		});

		const invalidSchemaClient = createGitHubHttpClient(
			{ context: baseContext() },
			{
				fetchFn: async () =>
					response(200, JSON.stringify({ wrong: true }), {
						'x-request-id': 'req-schema',
					}),
			},
		);
		await expect(
			invalidSchemaClient.request({
				path: '/repos/acme/repo',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toMatchObject({
			code: 'invalid-response',
			message: 'github response failed schema validation',
			details: { issues: 2 },
		});
	});
});
