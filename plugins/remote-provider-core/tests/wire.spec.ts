import { describe, expect, it } from 'vitest';

import {
	extractRequestId,
	parseLinkRelation,
	parsePaginationMeta,
	parseRateLimitMeta,
	unixSecondsToIso,
} from '../src/lib/wire.helper';

const headers = (values: Record<string, string>) => ({
	get: (name: string): string | null => values[name.toLowerCase()] ?? null,
});

describe('remote-provider wire helpers', () => {
	it('reads the next page from a Link header', () => {
		expect(
			parseLinkRelation('<https://x/y?page=3>; rel="next"', 'next'),
		).toBe('3');
		expect(parseLinkRelation(null, 'next')).toBeNull();
	});

	it('returns null pagination and rate limit when no header is present', () => {
		expect(parsePaginationMeta(headers({}))).toBeNull();
		expect(parseRateLimitMeta(headers({}))).toBeNull();
	});

	it('parses pagination, rate limit and request id headers', () => {
		const h = headers({
			'x-next-page': '2',
			'x-total': '9',
			'x-ratelimit-remaining': '4',
			'x-ratelimit-reset': '0',
			'x-github-request-id': 'abc',
		});
		expect(parsePaginationMeta(h)).toMatchObject({
			nextPage: '2',
			total: 9,
			hasMore: true,
		});
		expect(parseRateLimitMeta(h)).toMatchObject({
			remaining: 4,
			resetAt: unixSecondsToIso('0'),
		});
		expect(extractRequestId(h)).toBe('abc');
	});
});
