import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	NotificationsService,
	type ILockReleasedEvent,
} from '../../src/public/index';

describe('NotificationsService', async () => {
	it('wraps notification status and emits lock-released events', async () => {
		const service = new NotificationsService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input).toEqual({
						name: 'mcp-vertex_notification_notify_status',
						arguments: {},
					});
					return {
						structuredContent: {
							watching: '/tmp/agents.lock.json',
							emitted: 1,
							lastReleases: [
								{
									taskId: 't1',
									agent: 'agent-a',
									files: ['README.md'],
								},
							],
							agentEvents: 2,
						},
					};
				},
			}),
		);
		const events: ILockReleasedEvent[] = [];
		service.addEventListener('lock-released', (event) => {
			events.push(event);
		});

		await expect(service.status()).resolves.toEqual({
			watching: '/tmp/agents.lock.json',
			emitted: 1,
			lastReleases: [
				{
					type: 'lock-released',
					taskId: 't1',
					agent: 'agent-a',
					files: ['README.md'],
				},
			],
			agentEvents: 2,
		});
		expect(events).toEqual([
			{
				type: 'lock-released',
				taskId: 't1',
				agent: 'agent-a',
				files: ['README.md'],
			},
		]);
	});

	it('wraps await_lock and emits when the task releases', async () => {
		const service = new NotificationsService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input).toEqual({
						name: 'mcp-vertex_notification_await_lock',
						arguments: { taskId: 't2', timeoutMs: 10 },
					});
					return {
						structuredContent: {
							taskId: 't2',
							released: true,
							timedOut: false,
							alreadyFree: false,
							waitedMs: 4,
						},
					};
				},
			}),
		);
		const events: ILockReleasedEvent[] = [];
		service.addEventListener('lock-released', (event) => {
			events.push(event);
		});

		await expect(
			service.awaitLock({ taskId: 't2', timeoutMs: 10 }),
		).resolves.toEqual({
			taskId: 't2',
			released: true,
			timedOut: false,
			alreadyFree: false,
			waitedMs: 4,
		});
		expect(events).toEqual([
			{
				type: 'lock-released',
				taskId: 't2',
				agent: '',
				files: [],
			},
		]);
	});

	it('drops events for a slow subscriber instead of queueing unbounded work', async () => {
		const service = new NotificationsService(
			McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
		);
		const seen: string[] = [];
		let releaseSlowSubscriber!: () => void;
		const slowSubscriber = new Promise<void>((resolve) => {
			releaseSlowSubscriber = resolve;
		});
		service.addEventListener('cap', async (event) => {
			seen.push(event.message);
			await slowSubscriber;
		});

		service.emitStatus('cap', 'first');
		service.emitStatus('cap', 'second');
		expect(seen).toEqual(['first']);

		releaseSlowSubscriber();
		await slowSubscriber;
		await Promise.resolve();
		service.emitStatus('cap', 'third');
		expect(seen).toEqual(['first', 'third']);
	});
});
