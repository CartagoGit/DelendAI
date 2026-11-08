import { describe, expect, it } from 'vitest';

import {
	isHostAllowed,
	isHostPortAllowed,
	webFetch,
} from '../../../src/lib/services/engine';
import type { IFetchLike } from '../../../src/lib/services/engine';

const textResponse = (
	status: number,
	body: string,
	headers: Record<string, string> = {},
): ReturnType<IFetchLike> =>
	Promise.resolve({
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
		text: () => Promise.resolve(body),
	});

describe('isHostAllowed', async () => {
	it('matches an exact hostname', async () => {
		expect(isHostAllowed('example.com', ['example.com'])).toBe(true);
		expect(isHostAllowed('other.com', ['example.com'])).toBe(false);
	});

	it('matches a `*.suffix` wildcard against subdomains only', async () => {
		expect(isHostAllowed('docs.example.com', ['*.example.com'])).toBe(true);
		expect(isHostAllowed('example.com', ['*.example.com'])).toBe(false);
		expect(isHostAllowed('evilexample.com', ['*.example.com'])).toBe(false);
	});

	it('fails closed on an empty allow-list', async () => {
		expect(isHostAllowed('example.com', [])).toBe(false);
	});
});

describe('isHostPortAllowed', async () => {
	it('allows default web ports for hostname-only entries', async () => {
		expect(isHostPortAllowed('example.com', 80, ['example.com'])).toBe(
			true,
		);
		expect(isHostPortAllowed('example.com', 443, ['example.com'])).toBe(
			true,
		);
		expect(isHostPortAllowed('example.com', 6379, ['example.com'])).toBe(
			false,
		);
	});

	it('allows explicit host:port entries and wildcard host:port entries', async () => {
		expect(
			isHostPortAllowed('example.com', 6379, ['example.com:6379']),
		).toBe(true);
		expect(
			isHostPortAllowed('api.example.com', 8080, ['*.example.com:8080']),
		).toBe(true);
		expect(
			isHostPortAllowed('api.example.com', 8081, ['*.example.com:8080']),
		).toBe(false);
	});
});

describe('webFetch', async () => {
	it('fetches an allowed URL and returns its body', async () => {
		const fetchImpl: IFetchLike = () =>
			textResponse(200, 'hello world', { 'content-type': 'text/plain' });

		const result = await webFetch(
			{ url: 'https://example.com/page', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: true,
			url: 'https://example.com/page',
			status: 200,
			contentType: 'text/plain',
			body: 'hello world',
			truncated: false,
		});
	});

	it('rejects a URL whose host is not on the allow-list', async () => {
		const fetchImpl: IFetchLike = () => textResponse(200, 'unreachable');

		const result = await webFetch(
			{ url: 'https://evil.com/page', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: false,
			reason: 'blocked-host',
			detail: 'evil.com:443',
		});
	});

	it('rejects a non-default port when the allow-list only names the host', async () => {
		const fetchImpl: IFetchLike = () => textResponse(200, 'unreachable');

		const result = await webFetch(
			{ url: 'http://example.com:6379/page', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: false,
			reason: 'blocked-host',
			detail: 'example.com:6379',
		});
	});

	it('accepts default ports for hostname-only entries and explicit ports when allowed', async () => {
		const fetchImpl: IFetchLike = (url) => textResponse(200, url);

		const defaultPort = await webFetch(
			{ url: 'http://example.com/path', allowList: ['example.com'] },
			fetchImpl,
		);
		expect(defaultPort.ok).toBe(true);

		const explicitPort = await webFetch(
			{
				url: 'http://example.com:6379/path',
				allowList: ['example.com:6379'],
			},
			fetchImpl,
		);
		expect(explicitPort.ok).toBe(true);
	});

	it('keeps wildcard allow-list support when validating the effective port', async () => {
		const fetchImpl: IFetchLike = (url) => textResponse(200, url);

		const wildcardDefault = await webFetch(
			{
				url: 'https://docs.example.com/page',
				allowList: ['*.example.com'],
			},
			fetchImpl,
		);
		expect(wildcardDefault.ok).toBe(true);

		const wildcardExplicit = await webFetch(
			{
				url: 'http://docs.example.com:8080/page',
				allowList: ['*.example.com:8080'],
			},
			fetchImpl,
		);
		expect(wildcardExplicit.ok).toBe(true);
	});

	it('truncates an oversized response at maxBytes', async () => {
		const fetchImpl: IFetchLike = () => textResponse(200, 'x'.repeat(100));

		const result = await webFetch(
			{
				url: 'https://example.com',
				allowList: ['example.com'],
				maxBytes: 10,
			},
			fetchImpl,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.body).toBe('x'.repeat(10));
			expect(result.truncated).toBe(true);
		}
	});

	it('rejects a malformed URL', async () => {
		const fetchImpl: IFetchLike = () => textResponse(200, 'unreachable');

		const result = await webFetch(
			{ url: 'not a url', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-url',
			detail: 'not a url',
		});
	});

	it('follows an allow-listed redirect chain to its allow-listed target', async () => {
		let calls = 0;
		const fetchImpl: IFetchLike = (url) => {
			calls += 1;
			if (url === 'https://example.com/old') {
				return textResponse(302, '', {
					location: 'https://example.com/new',
				});
			}
			return textResponse(200, 'final page');
		};

		const result = await webFetch(
			{ url: 'https://example.com/old', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(calls).toBe(2);
		expect(result).toEqual({
			ok: true,
			url: 'https://example.com/new',
			status: 200,
			contentType: null,
			body: 'final page',
			truncated: false,
		});
	});

	it('rejects a redirect chain whose target host is not allow-listed', async () => {
		const fetchImpl: IFetchLike = (url) => {
			if (url === 'https://example.com/old') {
				return textResponse(302, '', {
					location: 'https://evil.com/steal',
				});
			}
			return textResponse(200, 'should never get here');
		};

		const result = await webFetch(
			{ url: 'https://example.com/old', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: false,
			reason: 'redirect-blocked',
			detail: 'evil.com:443',
		});
	});

	it('reports "timeout" when the fetch aborts', async () => {
		const fetchImpl: IFetchLike = () => {
			const err = new Error('aborted');
			err.name = 'AbortError';
			return Promise.reject(err);
		};

		const result = await webFetch(
			{ url: 'https://example.com', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe('timeout');
	});

	it('reports "fetch-error" on a network failure', async () => {
		const fetchImpl: IFetchLike = () =>
			Promise.reject(new Error('ECONNRESET'));

		const result = await webFetch(
			{ url: 'https://example.com', allowList: ['example.com'] },
			fetchImpl,
		);

		expect(result).toEqual({
			ok: false,
			reason: 'fetch-error',
			detail: 'Error: ECONNRESET',
		});
	});

	// x00169: method/headers/body used to be silently dropped — every
	// request left the engine as an unauthenticated GET regardless of
	// what the caller asked for.
	it('forwards method, headers and body to the fetcher', async () => {
		let seenInit: Parameters<IFetchLike>[1];
		const fetchImpl: IFetchLike = (_url, init) => {
			seenInit = init;
			return textResponse(201, '{"id":1}', {
				'content-type': 'application/json',
			});
		};

		const result = await webFetch(
			{
				url: 'https://example.com/items',
				allowList: ['example.com'],
				method: 'POST',
				headers: {
					authorization: 'Bearer tok',
					'content-type': 'application/json',
				},
				body: '{"name":"x"}',
			},
			fetchImpl,
		);

		expect(result.ok).toBe(true);
		expect(seenInit?.method).toBe('POST');
		expect(seenInit?.headers).toEqual({
			authorization: 'Bearer tok',
			'content-type': 'application/json',
		});
		expect(seenInit?.body).toBe('{"name":"x"}');
	});

	it('forwards method/headers/body unchanged across a redirect hop', async () => {
		const seenMethods: Array<string | undefined> = [];
		const fetchImpl: IFetchLike = (url, init) => {
			seenMethods.push(init?.method);
			if (url === 'https://example.com/old') {
				return textResponse(307, '', {
					location: 'https://example.com/new',
				});
			}
			return textResponse(200, 'ok');
		};

		await webFetch(
			{
				url: 'https://example.com/old',
				allowList: ['example.com'],
				method: 'PUT',
				body: 'payload',
			},
			fetchImpl,
		);

		expect(seenMethods).toEqual(['PUT', 'PUT']);
	});
});
