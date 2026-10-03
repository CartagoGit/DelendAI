import { describe, expect, it } from 'vitest';

import {
	listRecentErrors,
	normalizeLevel,
	sentryBuildListUrl,
	sentryParseList,
} from './list-errors';
import type { IErrorSource } from './ierror-source';

const fakeSource = (overrides: Partial<IErrorSource> = {}): IErrorSource => {
	const body = JSON.stringify({
		data: [
			{
				id: '1',
				title: 'TypeError in render',
				project: { slug: 'web' },
				level: 'error',
				lastSeen: '2026-07-25T10:00:00Z',
				count: 42,
				culprit: 'apps/web/src/components/Foo.tsx',
				permalink: 'https://sentry.example/issue/1',
			},
			{
				id: '2',
				title: 'NullPointer',
				project: { slug: 'api' },
				level: 'fatal',
				lastSeen: '2026-07-25T09:00:00Z',
				count: 7,
				culprit: 'apps/api/src/handler.ts',
				permalink: 'https://sentry.example/issue/2',
			},
			{
				id: '3',
				title: 'deprecated call',
				project: { slug: 'web' },
				level: 'info',
				lastSeen: '2026-07-25T08:00:00Z',
				count: 1,
				culprit: 'apps/web/src/lib/util.ts',
				permalink: 'https://sentry.example/issue/3',
			},
		],
	});
	const base: IErrorSource = {
		id: 'sentry',
		baseUrl: 'https://sentry.example',
		allowList: ['sentry.example'],
		token: 'secret-token-do-not-log',
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
	return { ...base, ...overrides };
};

describe('normalizeLevel', () => {
	it('maps vendor levels to the r00012 5-band scale', () => {
		expect(normalizeLevel('fatal')).toBe('fatal');
		expect(normalizeLevel('error')).toBe('error');
		expect(normalizeLevel('warning')).toBe('warning');
		expect(normalizeLevel('warn')).toBe('warning');
		expect(normalizeLevel('info')).toBe('info');
		expect(normalizeLevel('debug')).toBe('debug');
		expect(normalizeLevel(undefined)).toBe('unknown');
		expect(normalizeLevel('')).toBe('unknown');
	});
});

describe('sentryBuildListUrl', () => {
	it('includes default sort, query, and limit', () => {
		const url = sentryBuildListUrl(fakeSource())({ limit: 10 });
		expect(url).toContain('limit=10');
		expect(url).toContain('query=is%3Aunresolved');
		expect(url).toContain('sort=lastSeen');
	});

	it('passes through the cursor when supplied', () => {
		const url = sentryBuildListUrl(fakeSource())({
			limit: 5,
			cursor: '0:0:1',
		});
		expect(url).toContain('cursor=0%3A0%3A1');
	});

	it('clamps the limit to MAX_LIMIT', () => {
		const url = sentryBuildListUrl(fakeSource())({ limit: 9999 });
		expect(url).toContain('limit=100');
	});
});

describe('sentryParseList', () => {
	it('maps a Sentry data envelope to IObsIssue[]', () => {
		const out = sentryParseList(
			JSON.stringify({
				data: [
					{
						id: 'abc',
						title: 'Boom',
						project: { slug: 'web' },
						level: 'error',
						lastSeen: '2026-07-25T10:00:00Z',
						count: 5,
						culprit: 'web/src/x.ts',
						permalink: 'https://sentry/abc',
					},
				],
			}),
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			id: 'abc',
			title: 'Boom',
			project: 'web',
			level: 'error',
			eventCount: 5,
		});
	});

	it('returns an empty list when the body is not JSON', () => {
		expect(sentryParseList('not-json')).toEqual([]);
	});

	it('returns an empty list when `data` is missing', () => {
		expect(sentryParseList(JSON.stringify({ other: 1 }))).toEqual([]);
	});
});

describe('listRecentErrors', () => {
	it('returns an empty result when the source has no token', async () => {
		const out = await listRecentErrors(fakeSource({ token: '' }), {
			limit: 10,
		});
		expect(out.issues).toEqual([]);
		expect(out.source).toBe('sentry');
	});

	it('normalizes issues through the source parser', async () => {
		const out = await listRecentErrors(fakeSource(), { limit: 10 });
		expect(out.issues).toHaveLength(3);
		expect(out.issues[0]?.project).toBe('web');
		expect(out.issues[1]?.level).toBe('fatal');
	});

	it('filters by project when requested', async () => {
		const out = await listRecentErrors(fakeSource(), {
			limit: 10,
			project: 'api',
		});
		expect(out.issues).toHaveLength(1);
		expect(out.issues[0]?.project).toBe('api');
	});

	it('filters by level when requested', async () => {
		const out = await listRecentErrors(fakeSource(), {
			limit: 10,
			level: 'fatal',
		});
		expect(out.issues).toHaveLength(1);
		expect(out.issues[0]?.id).toBe('2');
	});

	it('redacts a leaked token from the body', async () => {
		const body = JSON.stringify({
			data: [
				{
					id: 'leaked',
					title: `token leak: secret-token-do-not-log`,
					project: { slug: 'web' },
					level: 'error',
					lastSeen: '2026-07-25T10:00:00Z',
					count: 1,
					culprit: 'web/x.ts',
					permalink: 'https://sentry/leaked',
				},
			],
		});
		const src = fakeSource({ parseList: sentryParseList });
		// Override fetch to return a body that contains the token.
		const stubFetch: IErrorSource['fetch'] = (() =>
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
			})) as never;
		(src as { fetch: IErrorSource['fetch'] }).fetch = stubFetch;
		const out = await listRecentErrors(src, { limit: 10 });
		// The redacted output should not contain the token verbatim.
		expect(JSON.stringify(out)).not.toContain('secret-token-do-not-log');
	});
});
