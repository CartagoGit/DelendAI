import { describe, expect, it } from 'vitest';

import { fetchIssue, listIssues } from '../../../src/lib/github-client';
import type { IFetchFn, ISpawnSync } from '../../../src/lib/github-client';

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

const rawIssue = {
	number: 123,
	title: 'Something is broken',
	state: 'open' as const,
	labels: [{ name: 'bug' }],
	user: { login: 'octocat' },
	html_url: 'https://github.com/o/r/issues/123',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-02T00:00:00Z',
	comments: 1,
	body: 'It does not work',
};

const rawComment = {
	user: { login: 'reviewer' },
	body: 'Can confirm',
	created_at: '2026-01-01T01:00:00Z',
	html_url: 'https://github.com/o/r/issues/123#comment-1',
};

const okJsonSpawn =
	(byPath: Record<string, unknown>): ISpawnSync =>
	(cmd) => {
		const path = cmd[2] ?? '';
		for (const [key, value] of Object.entries(byPath)) {
			if (path.includes(key)) {
				return {
					exitCode: 0,
					stdout: encode(JSON.stringify(value)),
					stderr: encode(''),
				};
			}
		}
		return { exitCode: 0, stdout: encode('null'), stderr: encode('') };
	};

const notFoundSpawn: ISpawnSync = () => ({
	exitCode: 127,
	stdout: encode(''),
	stderr: encode('command not found'),
});

const failingGhSpawn: ISpawnSync = () => ({
	exitCode: 1,
	stdout: encode(''),
	stderr: encode('HTTP 401: Bad credentials'),
});

const jsonFetch =
	(byPath: Record<string, unknown>): IFetchFn =>
	async (url) => {
		for (const [key, value] of Object.entries(byPath)) {
			if (url.includes(key)) {
				return {
					ok: true,
					status: 200,
					json: async () => value,
				};
			}
		}
		return { ok: false, status: 404, json: async () => ({}) };
	};

describe('fetchIssue', () => {
	it('uses the gh tier when gh succeeds', async () => {
		const spawnSync = okJsonSpawn({
			comments: [rawComment],
			'issues/123': rawIssue,
		});
		const fetchFn: IFetchFn = async () => {
			throw new Error('fetch should not be called when gh succeeds');
		};

		const result = await fetchIssue('o/r', 123, { spawnSync, fetchFn });

		expect(result.tier).toBe('gh');
		expect(result.data.number).toBe(123);
		expect(result.data.title).toBe('Something is broken');
		expect(result.data.body).toBe('It does not work');
		expect(result.data.labels).toEqual(['bug']);
		expect(result.comments).toEqual([
			{
				author: 'reviewer',
				body: 'Can confirm',
				createdAt: '2026-01-01T01:00:00Z',
				url: 'https://github.com/o/r/issues/123#comment-1',
			},
		]);
	});

	it('falls back to rest-authed when gh is not installed and GITHUB_TOKEN is set', async () => {
		const fetchFn = jsonFetch({
			comments: [rawComment],
			'issues/123': rawIssue,
		});
		let sawAuthHeader = false;
		const wrappedFetch: IFetchFn = async (url, init) => {
			if (init?.headers?.Authorization === 'Bearer secret-token') {
				sawAuthHeader = true;
			}
			return fetchFn(url, init);
		};

		const result = await fetchIssue('o/r', 123, {
			spawnSync: notFoundSpawn,
			fetchFn: wrappedFetch,
			env: { GITHUB_TOKEN: 'secret-token' },
		});

		expect(result.tier).toBe('rest-authed');
		expect(sawAuthHeader).toBe(true);
		expect(result.data.number).toBe(123);
	});

	it('falls back to rest-anon when gh is missing and there is no GITHUB_TOKEN', async () => {
		const fetchFn = jsonFetch({
			comments: [rawComment],
			'issues/123': rawIssue,
		});

		const result = await fetchIssue('o/r', 123, {
			spawnSync: notFoundSpawn,
			fetchFn,
			env: {},
		});

		expect(result.tier).toBe('rest-anon');
		expect(result.data.number).toBe(123);
	});

	it('throws (does not silently fall through) when gh is installed but fails for a real reason', async () => {
		await expect(
			fetchIssue('o/r', 123, {
				spawnSync: failingGhSpawn,
				fetchFn: async () => {
					throw new Error('should not reach fetch');
				},
				env: { GITHUB_TOKEN: 'x' },
			}),
		).rejects.toThrow(/gh api .* failed/);
	});

	it('throws when every applicable tier fails (rest-anon HTTP error)', async () => {
		const failingFetch: IFetchFn = async () => ({
			ok: false,
			status: 500,
			json: async () => ({}),
		});

		await expect(
			fetchIssue('o/r', 123, {
				spawnSync: notFoundSpawn,
				fetchFn: failingFetch,
				env: {},
			}),
		).rejects.toThrow(/HTTP 500/);
	});
});

describe('listIssues', () => {
	it('uses the gh tier and filters out pull requests', async () => {
		const spawnSync = okJsonSpawn({
			'issues?': [
				rawIssue,
				{ ...rawIssue, number: 124, pull_request: {} },
			],
		});

		const result = await listIssues(
			'o/r',
			{ state: 'open' },
			{
				spawnSync,
				fetchFn: async () => {
					throw new Error('fetch should not be called');
				},
			},
		);

		expect(result.tier).toBe('gh');
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.number).toBe(123);
	});

	it('falls back to rest-anon and respects labels/limit query params', async () => {
		let capturedUrl = '';
		const fetchFn: IFetchFn = async (url) => {
			capturedUrl = url;
			return { ok: true, status: 200, json: async () => [rawIssue] };
		};

		const result = await listIssues(
			'o/r',
			{ state: 'all', labels: ['bug', 'p1'], limit: 5 },
			{ spawnSync: notFoundSpawn, fetchFn, env: {} },
		);

		expect(result.tier).toBe('rest-anon');
		expect(capturedUrl).toContain('state=all');
		expect(capturedUrl).toContain('labels=bug%2Cp1');
		expect(capturedUrl).toContain('per_page=5');
	});
});
