import z from 'zod';
import { describe, expect, it } from 'vitest';

import type { IRemoteFetchResponse, RemoteFetchFn } from '../src';
import { createRemoteMutationExecutor } from '../src';

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

describe('createRemoteMutationExecutor', () => {
	it('rejects missing confirm before any HTTP request', async () => {
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			return response(201, JSON.stringify({ id: 'release-1' }));
		};
		const executor = createRemoteMutationExecutor(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				nowIso: () => '2026-08-31T00:00:00.000Z',
			},
			{ fetchFn },
		);

		const result = await executor.execute({
			actor: 'copilot',
			effect: 'create release',
			resource: 'cartago/delendai#v1.0.0',
			method: 'POST',
			path: '/repos/cartago/delendai/releases',
			responseSchema: z.object({ id: z.string() }).strict(),
			auditDetails: {
				note: 'token secret-token was used upstream',
			},
			redactValues: ['secret-token'],
		});

		expect(calls).toBe(0);
		expect(result).toMatchObject({
			ok: false,
			outcome: 'rejected',
			error: {
				code: 'confirmation-required',
				message: 'confirm: true required',
			},
			audit: {
				provider: 'github',
				remote: { attempts: 0, duplicate: false, status: null },
				details: { note: 'token [REDACTED] was used upstream' },
			},
		});
	});

	it('never retries mutable requests automatically and redacts failure details', async () => {
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			return response(502, 'temporary failure secret-token');
		};
		const executor = createRemoteMutationExecutor(
			{
				provider: 'gitlab',
				baseUrl: 'https://gitlab.example/api/v4/',
				token: 'secret-token',
				nowIso: () => '2026-08-31T00:00:00.000Z',
			},
			{ fetchFn },
		);

		const result = await executor.execute({
			confirm: true,
			actor: 'copilot',
			effect: 'retry pipeline',
			resource: 'project/1#pipeline-44',
			method: 'POST',
			path: '/projects/1/pipelines/44/retry',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
			redactValues: ['secret-token'],
		});

		expect(calls).toBe(1);
		expect(result).toMatchObject({
			ok: false,
			outcome: 'failed',
			error: {
				code: 'transient',
				retryable: true,
			},
			audit: {
				provider: 'gitlab',
				remote: { attempts: 1, duplicate: false, status: 502 },
			},
		});
		if (result.ok) throw new Error('expected failure result');
		expect(result.error.details).toBeUndefined();
	});

	it('replays a cached idempotency key as a typed duplicate without a second write', async () => {
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			return response(201, JSON.stringify({ id: 'release-1' }), {
				'x-request-id': 'req-1',
			});
		};
		const executor = createRemoteMutationExecutor(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				nowIso: () => '2026-08-31T00:00:00.000Z',
			},
			{ fetchFn },
		);
		const request = {
			confirm: true as const,
			actor: 'copilot',
			effect: 'create release',
			resource: 'cartago/delendai#v1.0.0',
			method: 'POST' as const,
			path: '/repos/cartago/delendai/releases',
			idempotencyKey: 'release:v1.0.0',
			responseSchema: z.object({ id: z.string() }).strict(),
		};

		const first = await executor.execute(request);
		const replay = await executor.execute(request);

		expect(calls).toBe(1);
		expect(first).toMatchObject({ ok: true, outcome: 'applied' });
		expect(replay).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			idempotentReplay: true,
			duplicate: {
				message:
					'idempotency key already completed this remote mutation',
				existing: { id: 'release-1' },
			},
			audit: {
				idempotency: { key: 'release:v1.0.0', replay: true },
				remote: { attempts: 1, duplicate: true, status: 201 },
			},
		});
	});

	it('rejects reusing one idempotency key for a different mutation fingerprint', async () => {
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			return response(201, JSON.stringify({ id: 'tag-1' }));
		};
		const executor = createRemoteMutationExecutor(
			{
				provider: 'gitlab',
				baseUrl: 'https://gitlab.example/api/v4/',
				token: 'secret-token',
				nowIso: () => '2026-08-31T00:00:00.000Z',
			},
			{ fetchFn },
		);

		await executor.execute({
			confirm: true,
			actor: 'copilot',
			effect: 'create tag',
			resource: 'project/1#v1.0.0',
			method: 'POST',
			path: '/projects/1/repository/tags',
			idempotencyKey: 'tag:v1.0.0',
			responseSchema: z.object({ id: z.string() }).strict(),
		});

		const result = await executor.execute({
			confirm: true,
			actor: 'copilot',
			effect: 'create release',
			resource: 'project/1#v1.0.0',
			method: 'POST',
			path: '/projects/1/releases',
			idempotencyKey: 'tag:v1.0.0',
			responseSchema: z.object({ id: z.string() }).strict(),
		});

		expect(calls).toBe(1);
		expect(result).toMatchObject({
			ok: false,
			outcome: 'failed',
			error: {
				code: 'duplicate-operation',
				message:
					'idempotency key was already used for a different mutation',
			},
			audit: {
				remote: { attempts: 0, duplicate: true, status: null },
			},
		});
	});

	it('normalizes provider duplicate responses through a classifier', async () => {
		let calls = 0;
		const fetchFn: RemoteFetchFn = async () => {
			calls += 1;
			return response(
				409,
				JSON.stringify({ message: 'release already exists' }),
				{
					'x-request-id': 'req-dup',
				},
			);
		};
		const executor = createRemoteMutationExecutor(
			{
				provider: 'github',
				baseUrl: 'https://api.example/',
				token: 'secret-token',
				nowIso: () => '2026-08-31T00:00:00.000Z',
			},
			{ fetchFn },
		);

		const result = await executor.execute({
			confirm: true,
			actor: 'copilot',
			effect: 'create release',
			resource: 'cartago/delendai#v1.0.0',
			method: 'POST',
			path: '/repos/cartago/delendai/releases',
			responseSchema: z.object({ id: z.string() }).strict(),
			classifyDuplicate: ({ error }) =>
				error?.status === 409
					? { message: 'release already exists remotely' }
					: null,
		});

		expect(calls).toBe(1);
		expect(result).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			duplicate: { message: 'release already exists remotely' },
			audit: {
				remote: {
					attempts: 1,
					duplicate: true,
					status: 409,
					requestId: 'req-dup',
				},
			},
		});
	});
});
