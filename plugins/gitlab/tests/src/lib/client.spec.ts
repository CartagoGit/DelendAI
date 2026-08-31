import z from 'zod';
import { describe, expect, it } from 'vitest';

import { createGitLabHttpClient } from '../../../src/index';

import type {
	IGitLabHttpClientDeps,
	IRemoteFetchResponse,
	RemoteFetchFn,
} from '../../../src/lib/client';

const baseContext = {
	provider: 'gitlab' as const,
	token: 'secret-token',
	apiBaseUrl: 'https://gitlab.example/api/v4',
	webBaseUrl: 'https://gitlab.example',
	host: 'gitlab.example',
	project: null,
	timeoutMs: 15_000,
	maxRetries: 0,
	retryBaseDelayMs: 250,
	sources: {
		token: 'env:GITLAB_TOKEN',
		apiBaseUrl: 'default' as const,
		webBaseUrl: 'default' as const,
		project: [] as const,
	},
};

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
	arrayBuffer?: ArrayBuffer,
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
	...(arrayBuffer === undefined
		? {}
		: { arrayBuffer: async () => arrayBuffer }),
});

const makeClient = (
	fetchFn: RemoteFetchFn,
	deps: Partial<IGitLabHttpClientDeps> = {},
) =>
	createGitLabHttpClient(
		{ context: baseContext },
		{
			fetchFn,
			...deps,
		},
	);

describe('createGitLabHttpClient (f00411 S3)', () => {
	it('returns HTTP 200 payloads with pagination and rate limit metadata', async () => {
		const client = makeClient(async () =>
			response(200, JSON.stringify({ ok: true }), {
				'x-request-id': 'req-200',
				'x-page': '2',
				'x-per-page': '20',
				'x-next-page': '3',
				'x-prev-page': '1',
				'x-total': '55',
				'x-total-pages': '3',
				'x-ratelimit-limit': '600',
				'x-ratelimit-remaining': '599',
				'x-ratelimit-reset': '1735689600',
				'x-ratelimit-resource': 'api',
				'retry-after': '5',
			}),
		);

		const result = await client.request({
			path: '/projects/1',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
		});

		expect(result.data).toEqual({ ok: true });
		expect(result.meta.status).toBe(200);
		expect(result.meta.requestId).toBe('req-200');
		expect(result.meta.pagination).toEqual({
			page: 2,
			perPage: 20,
			nextPage: '3',
			previousPage: '1',
			total: 55,
			totalPages: 3,
			hasMore: true,
		});
		expect(result.meta.rateLimit).toEqual({
			limit: 600,
			remaining: 599,
			resetAt: '2025-01-01T00:00:00.000Z',
			retryAfterSeconds: 5,
			scope: 'api',
			source: 'headers',
		});
	});

	it('normalizes 401 responses without exposing the token', async () => {
		const client = makeClient(async () =>
			response(401, JSON.stringify({ message: 'bad token' }), {
				'x-request-id': 'req-401',
			}),
		);

		await expect(
			client.request({
				path: '/projects/1',
				responseSchema: z.object({}).passthrough(),
			}),
		).rejects.toMatchObject({
			name: 'GitLabRequestError',
			code: 'unauthorized',
			status: 401,
			requestId: 'req-401',
			retryable: false,
			temporary: false,
		});

		await client
			.request({
				path: '/projects/1',
				responseSchema: z.object({}).passthrough(),
			})
			.catch((error: unknown) => {
				const rendered = JSON.stringify(error);
				expect(String(error)).not.toContain('secret-token');
				expect(rendered).not.toContain('secret-token');
			});
	});

	it('normalizes 403, 404 and 429 responses with the expected codes', async () => {
		const cases = [
			{ status: 403, code: 'forbidden', retryAfterSeconds: null },
			{ status: 404, code: 'not-found', retryAfterSeconds: null },
			{ status: 429, code: 'rate-limited', retryAfterSeconds: 60 },
		] as const;

		for (const testCase of cases) {
			const client = makeClient(async () =>
				response(testCase.status, JSON.stringify({ message: 'nope' }), {
					...(testCase.retryAfterSeconds === null
						? {}
						: {
								'retry-after': String(
									testCase.retryAfterSeconds,
								),
							}),
				}),
			);

			await expect(
				client.request({
					path: '/projects/1',
					responseSchema: z.object({}).passthrough(),
				}),
			).rejects.toMatchObject({
				name: 'GitLabRequestError',
				code: testCase.code,
				status: testCase.status,
				retryAfterSeconds: testCase.retryAfterSeconds,
			});
		}
	});

	it('maps timeout-like failures to a retryable timeout error', async () => {
		const client = makeClient(async () => {
			const error = new Error('request timed out');
			error.name = 'AbortError';
			throw error;
		});

		await expect(
			client.request({
				path: '/projects/1',
				responseSchema: z.object({}).passthrough(),
			}),
		).rejects.toMatchObject({
			name: 'GitLabRequestError',
			code: 'timeout',
			status: null,
			retryable: true,
			temporary: true,
		});
	});

	it('rejects non-JSON responses as invalid responses', async () => {
		const client = makeClient(async () =>
			response(200, 'not-json', {
				'x-request-id': 'req-invalid-json',
			}),
		);

		await expect(
			client.request({
				path: '/projects/1',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toMatchObject({
			name: 'GitLabRequestError',
			code: 'invalid-response',
			status: 200,
			requestId: 'req-invalid-json',
			message: 'gitlab returned a non-JSON body',
		});
	});

	it('rejects schema-invalid JSON responses with issue counts', async () => {
		const client = makeClient(async () =>
			response(200, JSON.stringify({ ok: 'yes' }), {
				'x-request-id': 'req-schema',
			}),
		);

		await expect(
			client.request({
				path: '/projects/1',
				responseSchema: z.object({ ok: z.boolean() }).strict(),
			}),
		).rejects.toMatchObject({
			name: 'GitLabRequestError',
			code: 'invalid-response',
			status: 200,
			requestId: 'req-schema',
			details: { issues: 1 },
		});
	});
});
