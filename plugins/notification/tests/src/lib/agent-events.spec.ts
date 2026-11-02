import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

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

/**
 * x00544 S3. Four of the bridge's writes are SIBLINGS reached through
 * `dirname(...)` of a path that was only checked lexically at register
 * time. `ws/linked` never leaves the workspace as a STRING, which is
 * exactly why that check accepted it while it named another tree.
 *
 * The bridge is a background watcher with no return channel, so a
 * refusal is reported on stderr rather than thrown — an exception here
 * would kill the heartbeat handler for every later event.
 */
describe('bridge physical containment (x00544 S3)', async () => {
	let parent = '';

	beforeEach(() => {
		parent = mkdtempSync(join(tmpdir(), 'agent-events-escape-'));
	});

	afterEach(() => rmSync(parent, { recursive: true, force: true }));

	it('refuses every release write when the watched tree is symlinked out of the workspace', async () => {
		const ws = join(parent, 'ws');
		const outside = join(parent, 'outside');
		mkdirSync(ws, { recursive: true });
		mkdirSync(join(outside, 'agent-queue'), { recursive: true });
		symlinkSync(outside, join(ws, 'linked'), 'dir');

		const lockFileAbs = join(ws, 'linked', 'agents.lock.json');
		const registryFile = join(ws, 'linked', 'subagent-registry.json');
		const queueFile = join(ws, 'linked', 'agent-queue', 'queue.json');
		const fileLocksFile = join(ws, 'linked', 'file-locks.json');
		const leaseFile = join(
			ws,
			'linked',
			'agent-queue',
			'.subscribe-leases.json',
		);

		writeFileSync(lockFileAbs, lock());
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

		const stderrChunks: string[] = [];
		const spy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: unknown) => {
				stderrChunks.push(String(chunk));
				return true;
			});

		const bridge = startAgentEventsBridge(
			fakePartial<Parameters<typeof startAgentEventsBridge>[0]>({
				sendLoggingMessage: async () => undefined,
			}),
			{
				namespacePrefix: 'proposals',
				lockFileAbs,
				agentRegistryFileAbs: registryFile,
				queueFileAbs: queueFile,
				workspaceRootAbs: ws,
				heartbeatMs: 1_000,
				intervalMs: 60_000,
			},
		);
		bridge.watcher.stop();
		await bridge.watcher.check(new Date('2026-06-20T00:00:00Z'));
		await bridge.watcher.check(new Date('2026-06-20T00:00:03Z'));
		bridge.close();
		spy.mockRestore();

		// The agent did die — the bridge saw it.
		expect(bridge.events.map((event) => event.kind)).toEqual([
			'agent-alive',
			'agent-dead',
		]);

		// ...but every release write was refused, so nothing changed.
		const lockState = JSON.parse(readFileSync(lockFileAbs, 'utf8')) as {
			in_flight: unknown[];
		};
		const fileLocksState = JSON.parse(
			readFileSync(fileLocksFile, 'utf8'),
		) as { locks: Record<string, unknown> };
		const leaseState = JSON.parse(readFileSync(leaseFile, 'utf8')) as {
			leases: unknown[];
		};
		expect(lockState.in_flight).toHaveLength(1);
		expect(fileLocksState.locks).toEqual({ 'src/a.ts': { taskId: 't1' } });
		expect(leaseState.leases).toHaveLength(1);
		expect(stderrChunks.some((c) => c.includes('refusing to write'))).toBe(
			true,
		);
	});
});
