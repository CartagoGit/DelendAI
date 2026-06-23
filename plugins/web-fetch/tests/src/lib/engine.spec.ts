import { describe, expect, it } from 'vitest';

import { isHostAllowed, webFetch } from '../../../src/lib/services/engine';
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

describe('isHostAllowed', () => {
	it('matches an exact hostname', () => {
		expect(isHostAllowed('example.com', ['example.com'])).toBe(true);
		expect(isHostAllowed('other.com', ['example.com'])).toBe(false);
	});

	it('matches a `*.suffix` wildcard against subdomains only', () => {
		expect(isHostAllowed('docs.example.com', ['*.example.com'])).toBe(true);
		expect(isHostAllowed('example.com', ['*.example.com'])).toBe(false);
		expect(isHostAllowed('evilexample.com', ['*.example.com'])).toBe(false);
	});

	it('fails closed on an empty allow-list', () => {
		expect(isHostAllowed('example.com', [])).toBe(false);
	});
});

describe('webFetch', () => {
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
			detail: 'evil.com',
		});
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
			detail: 'evil.com',
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
});
