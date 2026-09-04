import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	watchAgentHeartbeat,
	type IAgentEvent,
} from '@delendai/notification/public';
import { startAgentEventsBridge } from '@delendai/notification/public';

const lock = (taskId = 't1', agent = 'falcon') =>
	JSON.stringify({
		version: 1,
		stale_after_minutes: 10,
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
			onEvent: (event) => {
				seen.push(event);
			},
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
			onEvent: (event) => {
				seen.push(event);
			},
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
			onEvent: (event) => {
				seen.push(event);
			},
		});

		await watcher.check(new Date('2026-06-20T00:00:00Z'));
		await watcher.check(new Date('2026-06-20T00:00:03Z'));
		const events = await watcher.check(new Date('2026-06-20T00:00:10Z'));

		expect(events.map((event) => event.kind)).toEqual(['agent-idle']);
		expect(events[0]?.missedBeats).toBe(10);
	});

	it('uses each claim heartbeat instead of the global lock mtime', async () => {
		writeFileSync(
			lockFile,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'live',
						agent: 'falcon',
						started_at: '2026-06-20T00:00:00.000Z',
						last_seen: '2026-06-20T00:00:59.000Z',
					},
					{
						task_id: 'dead',
						agent: 'hawk',
						started_at: '2026-06-20T00:00:00.000Z',
						last_seen: '2026-06-20T00:00:00.000Z',
					},
				],
			}),
		);
		const seen: IAgentEvent[] = [];
		const watcher = watchAgentHeartbeat({
			lockFile,
			heartbeatMs: 1_000,
			onEvent: (event) => {
				seen.push(event);
			},
		});

		const events = await watcher.check(
			new Date('2026-06-20T00:01:00.000Z'),
		);

		expect(events).toHaveLength(1);
		expect(events.find((event) => event.taskId === 'live')).toBeUndefined();
		expect(events.find((event) => event.taskId === 'dead')).toMatchObject({
			kind: 'agent-dead',
		});
		expect(seen.map((event) => event.taskId)).toEqual(['dead']);
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

	it('bridge invokes the recovery hook when an agent dies', async () => {
		const dead: IAgentEvent[] = [];
		const server = {
			sendLoggingMessage: async () => undefined,
		};
		const bridge = startAgentEventsBridge(server as never, {
			namespacePrefix: 'proposals',
			lockFileAbs: lockFile,
			heartbeatMs: 1_000,
			intervalMs: 60_000,
			onAgentDead: (event) => {
				dead.push(event);
			},
		});
		bridge.watcher.stop();
		await bridge.watcher.check(new Date('2026-06-20T00:00:00Z'));
		await bridge.watcher.check(new Date('2026-06-20T00:00:03Z'));
		bridge.close();

		expect(dead).toHaveLength(1);
		expect(dead[0]).toMatchObject({
			kind: 'agent-dead',
			agent: 'falcon',
			taskId: 't1',
		});
	});

	it('bridge releases lock, registry, and subscription lease on agent death', async () => {
		const registryFile = join(dir, 'subagent-registry.json');
		const queueFile = join(dir, 'agent-queue', 'queue.json');
		const fileLocksFile = join(dir, 'file-locks.json');
		const leaseFile = join(dir, 'agent-queue', '.subscribe-leases.json');
		mkdirSync(join(dir, 'agent-queue'), { recursive: true });
		writeFileSync(
			registryFile,
			JSON.stringify({
				assignments: [
					{
						task_id: 't1',
						agent_name: 'falcon',
						parent_task_id: null,
					},
				],
			}),
		);
		writeFileSync(
			fileLocksFile,
			JSON.stringify({ locks: { 'src/a.ts': { taskId: 't1' } } }),
		);
		writeFileSync(
			leaseFile,
			JSON.stringify({
				leases: [
					{
						taskId: 't1',
						subscriberId: 'falcon',
						subscriptionId: 'sub-1',
						leaseUntil: '2026-09-01T00:00:00.000Z',
					},
				],
			}),
		);

		const server = {
			sendLoggingMessage: async () => undefined,
		};
		const bridge = startAgentEventsBridge(server as never, {
			namespacePrefix: 'proposals',
			lockFileAbs: lockFile,
			agentRegistryFileAbs: registryFile,
			queueFileAbs: queueFile,
			heartbeatMs: 1_000,
			intervalMs: 60_000,
		});
		bridge.watcher.stop();
		await bridge.watcher.check(new Date('2026-06-20T00:00:00Z'));
		await bridge.watcher.check(new Date('2026-06-20T00:00:03Z'));
		bridge.close();

		const lockState = JSON.parse(readFileSync(lockFile, 'utf8')) as {
			in_flight: unknown[];
		};
		const registryState = JSON.parse(
			readFileSync(registryFile, 'utf8'),
		) as {
			assignments: unknown[];
		};
		const fileLocksState = JSON.parse(
			readFileSync(fileLocksFile, 'utf8'),
		) as {
			locks: Record<string, unknown>;
		};
		const leaseState = JSON.parse(readFileSync(leaseFile, 'utf8')) as {
			leases: unknown[];
		};
		expect(lockState.in_flight).toEqual([]);
		expect(registryState.assignments).toEqual([]);
		expect(fileLocksState.locks).toEqual({});
		expect(leaseState.leases).toEqual([]);
		expect(existsSync(leaseFile)).toBe(true);
	});
});
