import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { LogsService } from '../../src/lib/services/logs.service';
import {
	correlateFixture,
	createFakeTransport,
	queryFixture,
	redactTestFixture,
	sampleEvent,
	subscribeFixture,
	tailFixture,
} from './logs.service.fixtures';

const makeService = (
	responses: Parameters<typeof createFakeTransport>[0] = {
		logs_query: queryFixture,
		logs_tail: tailFixture,
		logs_subscribe: subscribeFixture,
		logs_correlate: correlateFixture,
		logs_redact_test: redactTestFixture,
	},
) => {
	const { transport, calls } = createFakeTransport(responses);
	const client = McpStdioClient.fromTransport(transport);
	return { service: new LogsService(client), calls };
};

describe('LogsService', async () => {
	it('query calls logs_query and redacts secrets in summary + meta', async () => {
		const { service, calls } = makeService({
			logs_query: {
				events: [
					{
						...sampleEvent,
						summary: 'pasted AKIAIOSFODNN7EXAMPLE here',
						meta: {
							token: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
						},
					},
				],
				cursor: null,
				hasMore: false,
			},
		});
		const out = await service.query();
		expect(out.events).toHaveLength(1);
		expect(out.events[0]?.summary).not.toContain('AKIAIOSFODNN7EXAMPLE');
		expect(out.events[0]?.meta.token).not.toContain('ghp_');
		expect(calls[0]?.tool).toBe('logs_query');
	});

	it('tail respects limit and passes filter through', async () => {
		const { service, calls } = makeService();
		await service.tail(7, { kind: 'tool-call' });
		const last = calls[calls.length - 1];
		expect(last?.tool).toBe('logs_tail');
		expect(last?.args).toEqual({ limit: 7, kind: 'tool-call' });
	});

	it('correlate forwards taskId and agent to the server', async () => {
		const { service, calls } = makeService();
		await service.correlate({
			taskId: 'f00023',
			since: '2026-06-21T00:00:00Z',
		});
		const last = calls[calls.length - 1];
		expect(last?.tool).toBe('logs_correlate');
		expect(last?.args).toEqual({
			taskId: 'f00023',
			since: '2026-06-21T00:00:00Z',
		});
	});

	it('redactTest sends the payload and returns detected/redacted', async () => {
		const { service } = makeService();
		const out = await service.redactTest('hello world');
		expect(out.detected).toEqual(['aws-access-key']);
		expect(out.redacted).toContain('REDACTED');
	});

	it('subscribe polls and dedupes by ts+summary', async () => {
		// Build a transport that returns the same event twice, then a new one.
		let callIndex = 0;
		const responses: unknown[] = [
			{ events: [sampleEvent], stream: 'logs' },
			{ events: [sampleEvent], stream: 'logs' }, // duplicate
			{
				events: [
					{
						...sampleEvent,
						ts: '2026-06-21T07:00:01.000Z',
						summary: 'second event',
					},
				],
				stream: 'logs',
			},
		];
		const transport = {
			async callTool() {
				const r = responses[callIndex] ?? {
					events: [],
					stream: 'logs',
				};
				callIndex += 1;
				return { structuredContent: r, content: [], isError: false };
			},
			async listTools() {
				return { tools: [] };
			},
			async close() {
				return undefined;
			},
		};
		const client = McpStdioClient.fromTransport(
			transport as unknown as Parameters<
				typeof McpStdioClient.fromTransport
			>[0],
		);
		const service = new LogsService(client);
		const received: string[] = [];
		const ac = new AbortController();
		// Poll every 10ms; stop after collecting 2 events.
		const iter = (async (): Promise<void> => {
			for await (const ev of await service.subscribe({
				signal: ac.signal,
				pollIntervalMs: 10,
			})) {
				received.push(ev.summary);
				if (received.length >= 2) {
					ac.abort();
					return;
				}
			}
		})();
		await iter;
		expect(received).toEqual(['Plain summary, no secrets', 'second event']);
	});

	it('subscribe stops when signal aborts', async () => {
		const { service } = makeService();
		const ac = new AbortController();
		setTimeout(() => ac.abort(), 30);
		const start = Date.now();
		for await (const _ of await service.subscribe({
			signal: ac.signal,
			pollIntervalMs: 10,
		})) {
			// drain
		}
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(500);
	});
});
