import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	watchAgentHeartbeat,
	type IAgentEvent,
} from '@mcp-vertex/notification/public';
import { startAgentEventsBridge } from '@mcp-vertex/notification/public';

const lock = (taskId = 't1', agent = 'falcon') =>
	JSON.stringify({
		version: 1,
		in_flight: [{ task_id: taskId, agent, ownership: ['src/a.ts'] }],
	});

describe('agent heartbeat events (f00016 S8)', async () => {
	let dir = '';
	let lockFile = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'agent-events-'));
		lockFile = join(dir, 'agents.lock.json');
		writeFileSync(lockFile, lock());
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('emits agent-alive when the lock-file heartbeat mtime bumps', async () => {
		const seen: IAgentEvent[] = [];
		const watcher = watchAgentHeartbeat({
			lockFile,
			heartbeatMs: 1_000,
			onEvent: (event) => seen.push(event),
		});

		const events = await watcher.check(new Date('2026-06-20T00:00:00Z'));

		expect(events.map((event) => event.kind)).toEqual(['agent-alive']);
		expect(seen[0]).toMatchObject({
			kind: 'agent-alive',
			agent: 'falcon',
			taskId: 't1',
			missedBeats: 0,
		});
	});

	it('emits agent-dead after three missed heartbeats', async () => {
		const seen: IAgentEvent[] = [];
		const watcher = watchAgentHeartbeat({
			lockFile,
			heartbeatMs: 1_000,
			onEvent: (event) => seen.push(event),
		});

		await watcher.check(new Date('2026-06-20T00:00:00Z'));
		const events = await watcher.check(new Date('2026-06-20T00:00:03Z'));

		expect(events.map((event) => event.kind)).toEqual(['agent-dead']);
		expect(events[0]?.missedBeats).toBe(3);
	});

	it('emits agent-idle after ten missed heartbeats', async () => {
		const seen: IAgentEvent[] = [];
		const watcher = watchAgentHeartbeat({
			lockFile,
			heartbeatMs: 1_000,
			onEvent: (event) => seen.push(event),
		});

		await watcher.check(new Date('2026-06-20T00:00:00Z'));
		await watcher.check(new Date('2026-06-20T00:00:03Z'));
		const events = await watcher.check(new Date('2026-06-20T00:00:10Z'));

		expect(events.map((event) => event.kind)).toEqual(['agent-idle']);
		expect(events[0]?.missedBeats).toBe(10);
	});

	it('bridge forwards lifecycle events through the server logging channel', async () => {
		const messages: unknown[] = [];
		const server = {
			sendLoggingMessage: async (message: unknown) => {
				messages.push(message);
			},
		};

		const bridge = startAgentEventsBridge(server as never, {
			namespacePrefix: 'proposals',
			lockFileAbs: lockFile,
			heartbeatMs: 1_000,
			intervalMs: 60_000,
		});
		bridge.watcher.stop();
		await bridge.watcher.check(new Date('2026-06-20T00:00:00Z'));
		await bridge.watcher.check(new Date('2026-06-20T00:00:03Z'));
		bridge.close();

		expect(messages).toHaveLength(2);
		expect(messages[1]).toMatchObject({
			level: 'warning',
			logger: 'proposals_agent_events',
			data: { event: 'agent-dead', agent: 'falcon', taskId: 't1' },
		});
		expect(bridge.events.map((event) => event.kind)).toEqual([
			'agent-alive',
			'agent-dead',
		]);
	});
});
