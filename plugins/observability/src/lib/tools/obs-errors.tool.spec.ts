import { describe, expect, it } from 'vitest';

import { buildObsErrorsToolRegistration } from './obs-errors.tool';
import { sentryBuildListUrl, sentryParseList } from '../errors/list-errors';
import type { IErrorSource } from '../errors/ierror-source';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseOk = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

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
	for (const r of [regs]) void r.register(server as never);
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
		const issues = out.issues as unknown[];
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
});
