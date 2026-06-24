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
	const store = createLogStore(
		await mkdtemp(join(tmpdir(), 'mcp-vertex-tools-')),
	);
	await (await store).appendEvent(
		normalizeEvent(
			'tool-started',
			{ toolName: 'alpha', agent: 'a1' },
			new Date('2026-06-20T10:00:00.000Z'),
		),
	);
	await (await store).appendEvent(
		normalizeEvent(
			'tool-failed',
			{ toolName: 'beta', agent: 'a1' },
			new Date('2026-06-20T10:01:00.000Z'),
		),
	);
	const handlers = new Map<string, Handler>();
	const server = {
		registerTool: (name: string, _schema: unknown, handler: Handler) => {
			handlers.set(name, handler);
		},
	};
	for (const registration of buildLogToolRegistrations('logs', await store)) {
		await registration.register(server as never);
	}
	return handlers;
};

const structured = (value: unknown): Record<string, unknown> =>
	(value as { structuredContent: Record<string, unknown> }).structuredContent;

describe('log tools', async () => {
	it('registers the five read-only tools', async () => {
		const handlers = await registeredHandlers();
		expect([...handlers.keys()].sort()).toEqual([
			'logs_correlate',
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

		const sub = structured(
			await handlers.get('logs_subscribe')?.({ limit: 2 }),
		);
		expect(sub.stream).toBe('logs');

		const corr = structured(
			await handlers.get('logs_correlate')?.({ agent: 'a1' }),
		);
		expect(corr.firstTs).toBe('2026-06-20T10:00:00.000Z');
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
