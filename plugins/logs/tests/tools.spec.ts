import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { createLogStore } from '../src/lib/services/log-store';
import { normalizeEvent } from '../src/lib/services/normalize-event';
import { redactTest } from '../src/lib/services/redact-test';
import { buildLogToolRegistrations } from '../src/lib/tools/tools';
import { asArray } from '@mcp-vertex/test-kit/public';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const registeredHandlers = async () => {
	const store = await createLogStore(
		await mkdtemp(join(tmpdir(), 'mcp-vertex-tools-')),
	);
	const errorStore = await createLogStore(
		await mkdtemp(join(tmpdir(), 'mcp-vertex-tools-errors-')),
	);
	await store.appendEvent(
		normalizeEvent(
			'tool-started',
			{ toolName: 'alpha', agent: 'a1' },
			new Date('2026-06-20T10:00:00.000Z'),
		),
	);
	await store.appendEvent(
		normalizeEvent(
			'tool-failed',
			{
				toolName: 'beta',
				agent: 'a1',
				error: { message: 'boom', stack: 'Error: boom\n    at beta' },
				summary: 'tool-failed: beta — boom',
			},
			new Date('2026-06-20T10:01:00.000Z'),
		),
	);
	// Seeded independently of `store` — proves `errors_tail` reads its
	// own curated stream, not the main timeline.
	await errorStore.appendEvent(
		normalizeEvent(
			'tool-failed',
			{
				toolName: 'gamma',
				agent: 'a1',
				error: 'boom',
				summary: 'tool-failed: gamma — boom',
			},
			new Date('2026-06-20T10:02:00.000Z'),
		),
	);
	await errorStore.appendEvent(
		normalizeEvent(
			'tool-failed',
			{
				toolName: 'delta',
				agent: 'a2',
				error: {
					message: 'kaboom',
					stack: 'Error: kaboom\n    at delta',
				},
				summary: 'tool-failed: delta — kaboom',
			},
			new Date('2026-06-20T10:03:00.000Z'),
		),
	);
	const handlers = new Map<string, Handler>();
	const server = {
		registerTool: (name: string, _schema: unknown, handler: Handler) => {
			handlers.set(name, handler);
		},
	};
	for (const registration of buildLogToolRegistrations('logs', {
		main: store,
		errors: errorStore,
	})) {
		await registration.register(server as never);
	}
	return handlers;
};

const structured = (value: unknown): Record<string, unknown> =>
	(value as { structuredContent: Record<string, unknown> }).structuredContent;

describe('log tools', async () => {
	it('registers the nine tools (six read-only + log + search + incidents)', async () => {
		const handlers = await registeredHandlers();
		expect([...handlers.keys()].sort()).toEqual([
			'logs_correlate',
			'logs_errors_tail',
			'logs_incidents',
			'logs_log',
			'logs_query',
			'logs_redact_test',
			'logs_search',
			'logs_subscribe',
			'logs_tail',
		]);
	});

	it('queries with cursor pagination', async () => {
		const handlers = await registeredHandlers();
		const first = structured(
			await handlers.get('logs_query')?.({ limit: 1 }),
		);
		expect(first.detail).toBe('normal');
		expect(asArray(first.events)).toHaveLength(1);
		expect(
			(first.events as Array<{ meta?: Record<string, unknown> }>)[0]
				?.meta,
		).toEqual({});
		expect(first.hasMore).toBe(true);
		const second = structured(
			await handlers.get('logs_query')?.({
				limit: 1,
				cursor: first.cursor,
				detail: 'full',
			}),
		);
		expect(second.detail).toBe('full');
		const secondEvent = (
			second.events as Array<{
				meta: {
					toolName?: string;
					error?: Record<string, unknown>;
				};
				summary: string;
			}>
		)[0];
		expect(secondEvent?.meta.toolName).toBe('beta');
		expect(secondEvent?.summary).toBe('tool-failed: beta');
		expect(secondEvent?.meta.error).toEqual({
			redacted: true,
			fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
			hasStack: true,
		});
		expect(JSON.stringify(secondEvent)).not.toContain('boom');
		expect(second.hasMore).toBe(false);
	});

	it('tails, subscribes and correlates events', async () => {
		const handlers = await registeredHandlers();
		const tail = structured(
			await handlers.get('logs_tail')?.({ outcomeFilter: 'failed' }),
		);
		expect(tail.detail).toBe('normal');
		expect((tail.events as Array<{ outcome: string }>)[0]?.outcome).toBe(
			'failed',
		);
		expect(
			(tail.events as Array<{ meta: Record<string, unknown> }>)[0]?.meta,
		).toEqual({});

		const detailedTail = structured(
			await handlers.get('logs_tail')?.({
				outcomeFilter: 'failed',
				includeMeta: true,
			}),
		);
		expect(detailedTail.detail).toBe('full');
		const detailedEvent = (
			detailedTail.events as Array<{
				meta: {
					toolName?: string;
					error?: Record<string, unknown>;
				};
				summary: string;
			}>
		)[0];
		expect(detailedEvent?.meta.toolName).toBe('beta');
		expect(detailedEvent?.summary).toBe('tool-failed: beta');
		expect(detailedEvent?.meta.error).toEqual({
			redacted: true,
			fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
			hasStack: true,
		});
		expect(JSON.stringify(detailedEvent)).not.toContain('boom');

		const sub = structured(
			await handlers.get('logs_subscribe')?.({ limit: 2 }),
		);
		expect(sub.detail).toBe('normal');
		expect(sub.stream).toBe('logs');

		const corr = structured(
			await handlers.get('logs_correlate')?.({ agent: 'a1' }),
		);
		expect(corr.detail).toBe('normal');
		expect(corr.firstTs).toBe('2026-06-20T10:00:00.000Z');
	});

	it('errors_tail reads only the curated error stream, compact by default', async () => {
		const handlers = await registeredHandlers();
		const errors = structured(await handlers.get('logs_errors_tail')?.({}));
		expect(errors.detail).toBe('normal');
		const events = errors.events as Array<{
			taskId: string | null;
			meta: Record<string, unknown>;
		}>;
		expect(events).toHaveLength(2);
		expect(events.map((event) => event.taskId).sort()).toEqual([
			'delta',
			'gamma',
		]);
		expect(events[0]?.meta).toEqual({});
		const detailed = structured(
			await handlers.get('logs_errors_tail')?.({ includeMeta: true }),
		);
		expect(detailed.detail).toBe('full');
		const detailedErrorEvent = (
			detailed.events as Array<{
				meta: {
					toolName?: string;
					error?: Record<string, unknown>;
				};
				summary: string;
			}>
		)[0];
		expect(detailedErrorEvent?.meta.toolName).toBe('gamma');
		expect(detailedErrorEvent?.summary).toBe('tool-failed: gamma');
		expect(detailedErrorEvent?.meta.error).toEqual({
			redacted: true,
			fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
			hasStack: false,
		});
		expect(JSON.stringify(detailedErrorEvent)).not.toContain('boom');
	});

	it('errors_tail honors includeMeta:false to strip context', async () => {
		const handlers = await registeredHandlers();
		const errors = structured(
			await handlers.get('logs_errors_tail')?.({ includeMeta: false }),
		);
		expect(errors.detail).toBe('normal');
		const events = errors.events as Array<{
			meta: Record<string, unknown>;
		}>;
		expect(events[0]?.meta).toEqual({});
	});

	it('incidents exposes safe hasStack metadata without raw summaries when recent events are omitted', async () => {
		const handlers = await registeredHandlers();
		const incidents = structured(
			await handlers.get('logs_incidents')?.({
				minCount: 1,
				recentLimit: 0,
			}),
		);
		const cluster = (
			incidents.incidents as Array<{
				toolName: string;
				sampleSummary: string;
				hasStack: boolean;
			}>
		).find((entry) => entry.toolName === 'delta');
		expect(cluster?.sampleSummary).toBe('tool-failed: delta');
		expect(cluster?.hasStack).toBe(true);
		expect(JSON.stringify(cluster)).not.toContain('kaboom');
	});

	it('tail honors compact detail by trimming per-event context', async () => {
		const handlers = await registeredHandlers();
		const tail = structured(
			await handlers.get('logs_tail')?.({
				outcomeFilter: 'failed',
				detail: 'compact',
			}),
		);
		expect(tail.detail).toBe('compact');
		const events = tail.events as Array<Record<string, unknown>>;
		expect(events[0]).toEqual({
			ts: '2026-06-20T10:01:00.000Z',
			kind: 'tool-failed',
			outcome: 'failed',
			severity: 'error',
			incidentType: 'tool-failure',
			summary: 'tool-failed: beta',
		});
	});

	it('tail — v00132 (AUD-F06): content[0].text is a compact summary, not a duplicate of structuredContent', async () => {
		const handlers = await registeredHandlers();
		const result = (await handlers.get('logs_tail')?.({
			outcomeFilter: 'failed',
		})) as {
			content: ReadonlyArray<{ type: string; text: string }>;
			structuredContent: Record<string, unknown>;
		};
		const text = result.content[0]?.text ?? '';
		expect(text).not.toBe(JSON.stringify(result.structuredContent));
		expect(() => JSON.parse(text)).not.toThrow();
		expect(typeof JSON.parse(text)).toBe('string');
		expect(text).toContain('log lines');
	});

	it('redacts canary payloads', async () => {
		const result = redactTest(
			'token ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL and AKIA1234567890ABCDEF',
		);
		expect(result.detected).toContain('github-token');
		expect(result.detected).toContain('aws-access-key');
		expect(result.redacted).not.toContain('ghp_');
	});
});
