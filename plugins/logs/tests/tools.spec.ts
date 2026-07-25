import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { createLogStore } from '../src/lib/services/log-store';
import { normalizeEvent } from '../src/lib/services/normalize-event';
import { redactTest } from '../src/lib/services/redact-test';
import { buildLogToolRegistrations } from '../src/lib/tools/tools';

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
			{ toolName: 'beta', agent: 'a1' },
			new Date('2026-06-20T10:01:00.000Z'),
		),
	);
	// Seeded independently of `store` — proves `errors_tail` reads its
	// own curated stream, not the main timeline.
	await errorStore.appendEvent(
		normalizeEvent(
			'tool-failed',
			{ toolName: 'gamma', agent: 'a1', error: 'boom' },
			new Date('2026-06-20T10:02:00.000Z'),
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
	it('registers the six read-only tools', async () => {
		const handlers = await registeredHandlers();
		expect([...handlers.keys()].sort()).toEqual([
			'logs_correlate',
			'logs_errors_tail',
			'logs_query',
			'logs_redact_test',
			'logs_subscribe',
			'logs_tail',
		]);
	});

	it('queries with cursor pagination', async () => {
		const handlers = await registeredHandlers();
		const first = structured(
			await handlers.get('logs_query')?.({ limit: 1 }),
		);
		expect(first.events as unknown[]).toHaveLength(1);
		expect(first.hasMore).toBe(true);
		const second = structured(
			await handlers.get('logs_query')?.({
				limit: 1,
				cursor: first.cursor,
			}),
		);
		expect(second.hasMore).toBe(false);
	});

	it('tails, subscribes and correlates events', async () => {
		const handlers = await registeredHandlers();
		const tail = structured(
			await handlers.get('logs_tail')?.({ outcomeFilter: 'failed' }),
		);
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
		expect(
			(
				detailedTail.events as Array<{
					meta: Record<string, unknown>;
				}>
			)[0]?.meta.toolName,
		).toBe('beta');

		const sub = structured(
			await handlers.get('logs_subscribe')?.({ limit: 2 }),
		);
		expect(sub.stream).toBe('logs');

		const corr = structured(
			await handlers.get('logs_correlate')?.({ agent: 'a1' }),
		);
		expect(corr.firstTs).toBe('2026-06-20T10:00:00.000Z');
	});

	it('errors_tail reads only the curated error stream, with full meta by default', async () => {
		const handlers = await registeredHandlers();
		const errors = structured(await handlers.get('logs_errors_tail')?.({}));
		const events = errors.events as Array<{
			taskId: string | null;
			meta: Record<string, unknown>;
		}>;
		expect(events).toHaveLength(1);
		expect(events[0]?.taskId).toBe('gamma');
		// Full context by default — no second call needed to see why it broke.
		expect(events[0]?.meta.toolName).toBe('gamma');
		expect(events[0]?.meta.error).toBe('boom');
	});

	it('errors_tail honors includeMeta:false to strip context', async () => {
		const handlers = await registeredHandlers();
		const errors = structured(
			await handlers.get('logs_errors_tail')?.({ includeMeta: false }),
		);
		const events = errors.events as Array<{
			meta: Record<string, unknown>;
		}>;
		expect(events[0]?.meta).toEqual({});
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
