import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	classifyZombies,
	gcZombies,
	thresholdFromOrphans,
} from '@delendai/proposals/lib/agents/zombie-reconcile';
import { createAgentRegistryStore } from '@delendai/proposals/lib/shared/agent-registry-store';
import type { IAgentRegistry } from '@delendai/proposals/lib/shared/agent-registry-store';

const TEMP_DIRS: string[] = [];

const createTempPath = (
	prefix: string,
	filename: string,
	content: string,
): string => {
	const dir = mkdtempSync(join(tmpdir(), `delendai-test-${prefix}-`));
	TEMP_DIRS.push(dir);
	const filePath = join(dir, filename);
	writeFileSync(filePath, content, 'utf8');
	return filePath;
};

afterEach(() => {
	for (const dir of TEMP_DIRS.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('zombie-reconcile', async () => {
	const now = new Date('2026-06-05T12:00:00.000Z');

	// 1. Empty registry + empty lock
	it('Case 1: Empty registry + empty lock', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments: [],
		};
		const lockSnapshot = { in_flight: [] };

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	// 2. Entry: adopted: true, status: 'cooldown', cooldown_until: null, last_seen > 10 min, sin entrada en lock
	it('Case 2: Entry: adopted: true, status: "cooldown", cooldown_until: null, last_seen > 10 min, sin entrada en lock', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'fixing tests',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z', // 15 minutes ago (stale)
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockSnapshot = { in_flight: [] };

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans.length).toBe(1);
		expect(report.orphans[0]!.agentName).toBe('agent_zombie');
		expect(report.orphans[0]!.recommendedAction).toBe('force_release');
		expect(report.threshold).toBe('yellow');
	});

	// 3. Entry con entrada activa en lock.in_flight (mismo task_id)
	it('Case 3: Entry con entrada activa en lock.in_flight (mismo task_id)', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'fixing tests',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z', // 15 minutes ago
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockSnapshot = {
			in_flight: [
				{
					task_id: 'task-1',
					agent: 'agent_zombie',
					claimed_at: '2026-06-05T11:55:00.000Z', // lock claimed 5 minutes ago (active)
				},
			],
		};

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	// 4. Entry con status: 'active' and not stale -> NO clasificada como zombie
	it('Case 4: Entry con status: "active" (not stale)', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_active', task_id: 'task-2' }],
			assignments: [
				{
					task_id: 'task-2',
					agent_name: 'agent_active',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'active task',
					adopted: true,
					assigned_at: '2026-06-05T11:50:00.000Z',
					last_seen: '2026-06-05T11:55:00.000Z', // 5 minutes ago (not stale)
					cooldown_until: null,
					status: 'active',
				},
			],
		};
		const lockSnapshot = { in_flight: [] };

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	// 5. GC manual de un orphan confirmado (age > 10 min, sin lock)
	it('Case 5: GC manual de un orphan confirmado (age > 10 min, sin lock)', async () => {
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'stale task',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockData = {
			version: 1,
			in_flight: [],
		};

		const registryPath = createTempPath(
			'reg',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock',
			'agents.lock.json',
			JSON.stringify(lockData),
		);
		const queuePath = createTempPath('queue', 'queue.json', '{}');

		const queueEmitter = vi
			.fn()
			.mockImplementation(() => Promise.resolve());

		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});

		expect(report.orphans.length).toBe(1);
		expect(report.orphans[0]!.agentName).toBe('agent_zombie');
		// R-2026-08-31: the orphan registry row was deleted, but no
		// lock was freed (in_flight was empty). The watchdog event is
		// intentionally NOT emitted — `releasedLockCount === 0`
		// documents the new contract.
		expect(report.releasedLockCount).toBe(0);
		expect(queueEmitter).toHaveBeenCalledTimes(0);

		// Verify registry actually updated (entry removed)
		const store = createAgentRegistryStore(registryPath);
		const updatedRegistry = await store.read();
		expect(
			updatedRegistry.assignments.find(
				(a: any) => a.task_id === 'task-1',
			),
		).toBeUndefined();
	});

	// 6. Reconcile idempotente: dos llamadas con mismo estado rancio
	it('Case 6: Reconcile idempotente: dos llamadas con mismo estado rancio', async () => {
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'stale task',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockData = {
			version: 1,
			in_flight: [],
		};

		const registryPath = createTempPath(
			'reg',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock',
			'agents.lock.json',
			JSON.stringify(lockData),
		);
		const queuePath = createTempPath('queue', 'queue.json', '{}');

		const queueEmitter = vi
			.fn()
			.mockImplementation(() => Promise.resolve());

		// Call 1
		const report1 = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});

		// Call 2
		const report2 = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});

		expect(report1.orphans.length).toBe(1);
		expect(report2.orphans.length).toBe(0); // Already deleted on first run
		// R-2026-08-31: queueEmitter is only invoked when a lock was
		// actually released. The test fixture has an empty
		// `in_flight`, so no lock existed and the emitter is not
		// called. The fixture used to assert one call before the fix;
		// the new contract surfaces phantom watchdog events that the
		// engine no longer produces.
		expect(queueEmitter).toHaveBeenCalledTimes(0);
	});

	// 7. Backpressure event emission cuando un lock real se libera
	it('Case 7: Backpressure event emission when the orphan had an active lock', async () => {
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'stale task',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		// R-2026-08-31: the lock fixture uses the same shape
		// `runAgentLockEngine` writes. `host`/`pid` are required so the
		// pid-mismatch branch recognises the entry as a real prior
		// claim and the release actually frees it (returning
		// `removed: 1`). `last_seen` MUST be stale (>10 min before
		// `now`) so the classify step tags the row as
		// `stale_with_orphaned_lock` — a fresh lock with a stale
		// registry row is intentionally NOT classified as a zombie
		// (the agent could come back any moment).
		const lockData = {
			version: 1,
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'task-1',
					agent: 'agent_zombie',
					ownership: ['packages/proposals/src/foo.ts'],
					started_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:30:00.000Z', // 30 min stale
					host: 'dead-host',
					pid: 999999,
				},
			],
		};

		const registryPath = createTempPath(
			'reg-bp',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock-bp',
			'agents.lock.json',
			JSON.stringify(lockData),
		);
		const queuePath = createTempPath('queue-bp', 'queue.json', '{}');

		const queueEmitter = vi
			.fn()
			.mockImplementation(() => Promise.resolve());

		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});

		// The orphan registry row was deleted; `releasedLockCount`
		// is incremented because the entry was freed. The watchdog
		// event fires once with the canonical taskId shape.
		expect(report.releasedLockCount).toBe(1);
		expect(queueEmitter).toHaveBeenCalledWith(
			expect.stringContaining('zombie-gc-event-'),
			4,
		);
	});

	// R-2026-08-31: orphan WITHOUT a lock does not emit phantom events
	it('Case 7b: orphan sin lock activo NO emite phantom watchdog events', async () => {
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'orphan without lock',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const registryPath = createTempPath(
			'reg-nolock',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock-nolock',
			'agents.lock.json',
			JSON.stringify({ version: 1, in_flight: [] }),
		);
		const queuePath = createTempPath('queue-nolock', 'queue.json', '{}');

		const queueEmitter = vi
			.fn()
			.mockImplementation(() => Promise.resolve());

		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});
		expect(report.orphans.length).toBe(1);
		expect(report.releasedLockCount).toBe(0);
		expect(queueEmitter).not.toHaveBeenCalled();
	});

	// 8. Threshold verde: 0 orphans
	it('Case 8: Threshold verde: 0 orphans', async () => {
		expect(thresholdFromOrphans(0)).toBe('green');
	});

	// 9. Threshold amarillo: 1–2 orphans
	it('Case 9: Threshold amarillo: 1–2 orphans', async () => {
		expect(thresholdFromOrphans(1)).toBe('yellow');
		expect(thresholdFromOrphans(2)).toBe('yellow');
	});

	// 10. Threshold rojo: >= 3 orphans
	it('Case 10: Threshold rojo: >= 3 orphans', async () => {
		expect(thresholdFromOrphans(3)).toBe('red');
		expect(thresholdFromOrphans(10)).toBe('red');
	});

	// 11. Entry con adopted: false, cooldown_until: null
	it('Case 11: Entry con adopted: false, cooldown_until: null', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'non-adopted task',
					adopted: false, // not adopted
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockSnapshot = { in_flight: [] };

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	// 12. Entry with cooldown_until: null but last_seen only 2 minutes ago
	it('Case 12: Entry with cooldown_until: null but last_seen only 2 minutes ago', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'fresh task',
					adopted: true,
					assigned_at: '2026-06-05T11:50:00.000Z',
					last_seen: '2026-06-05T11:58:00.000Z', // 2 minutes ago
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockSnapshot = { in_flight: [] };

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	// Recommended Case: Entry with lock.in_flight entry that is also stale (stale lock)
	it('Recommended Case: Entry with lock.in_flight entry that is also stale (stale lock)', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'stale task',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const lockSnapshot = {
			in_flight: [
				{
					task_id: 'task-1',
					agent: 'agent_zombie',
					claimed_at: '2026-06-05T11:40:00.000Z', // lock claimed 20 minutes ago (stale too)
				},
			],
		};

		const report = classifyZombies(registry, lockSnapshot, now, 10);
		expect(report.orphans.length).toBe(1);
		expect(report.orphans[0]!.agentName).toBe('agent_zombie');
		expect(report.orphans[0]!.reason).toBe('stale_with_orphaned_lock');
		expect(report.orphans[0]!.recommendedAction).toBe('force_release');
	});

	// t00002 S2: error branches.
	it('Case 7: corrupt lock (invalid JSON) is treated as no claims — orphan is still detected', async () => {
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_zombie', task_id: 'task-1' }],
			assignments: [
				{
					task_id: 'task-1',
					agent_name: 'agent_zombie',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'stale task',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:45:00.000Z',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const registryPath = createTempPath(
			'reg-corrupt',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock-corrupt',
			'agents.lock.json',
			'{ this is not json',
		);
		const queuePath = createTempPath('queue-corrupt', 'queue.json', '{}');

		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: true,
			staleAfterMinutes: 10,
			now,
		});
		expect(report.orphans.length).toBe(1);
	});

	it('Case 8: assignment con last_seen no parseable se ignora sin reventar', async () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [{ name: 'agent_x', task_id: 'task-x' }],
			assignments: [
				{
					task_id: 'task-x',
					agent_name: 'agent_x',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'bad timestamp',
					adopted: true,
					assigned_at: '2026-06-05T11:00:00.000Z',
					last_seen: 'not-a-date',
					cooldown_until: null,
					status: 'cooldown',
				},
			],
		};
		const report = classifyZombies(registry, { in_flight: [] }, now, 10);
		expect(report.orphans).toEqual([]);
		expect(report.threshold).toBe('green');
	});

	it('Case 9: lock with in_flight non-array is treated as empty', async () => {
		const registryPath = createTempPath(
			'reg-noarr',
			'subagent-registry.json',
			JSON.stringify({
				version: 1,
				adopted: [{ name: 'agent_z', task_id: 'task-1' }],
				assignments: [
					{
						task_id: 'task-1',
						agent_name: 'agent_z',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 't',
						adopted: true,
						assigned_at: '2026-06-05T11:00:00.000Z',
						last_seen: '2026-06-05T11:45:00.000Z',
						cooldown_until: null,
						status: 'cooldown',
					},
				],
			}),
		);
		const lockPath = createTempPath(
			'lock-noarr',
			'agents.lock.json',
			JSON.stringify({ in_flight: 5 }),
		);
		const queuePath = createTempPath('queue-noarr', 'queue.json', '{}');
		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: true,
			staleAfterMinutes: 10,
			now,
		});
		expect(report.orphans.length).toBe(1);
	});

	it('Case 10: malformed lock entries (numeric task_id, missing started_at) are normalised', async () => {
		const registryPath = createTempPath(
			'reg-malf',
			'subagent-registry.json',
			JSON.stringify({
				version: 1,
				adopted: [{ name: 'agent_z', task_id: 'task-1' }],
				assignments: [
					{
						task_id: 'task-1',
						agent_name: 'agent_z',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 't',
						adopted: true,
						assigned_at: '2026-06-05T11:00:00.000Z',
						last_seen: '2026-06-05T11:45:00.000Z',
						cooldown_until: null,
						status: 'cooldown',
					},
				],
			}),
		);
		const lockPath = createTempPath(
			'lock-malf',
			'agents.lock.json',
			JSON.stringify({
				in_flight: [
					{ task_id: 42, last_seen: '2026-06-05T11:00:00.000Z' },
					{ agent: 7 },
				],
			}),
		);
		const queuePath = createTempPath('queue-malf', 'queue.json', '{}');
		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: true,
			staleAfterMinutes: 10,
			now,
		});
		// The malformed lock entries do not match task-1, so it is a
		// stale orphan without lock.
		expect(report.orphans.length).toBe(1);
		expect(report.orphans[0]!.reason).toBe('cooldown_null');
	});

	it('Case 11: gcZombies con opciones por defecto muta el registro sin queueEmitter', async () => {
		const registryPath = createTempPath(
			'reg-defaults',
			'subagent-registry.json',
			JSON.stringify({
				version: 1,
				adopted: [{ name: 'agent_old', task_id: 'task-old' }],
				assignments: [
					{
						task_id: 'task-old',
						agent_name: 'agent_old',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 'ancient',
						adopted: true,
						assigned_at: '2020-01-01T00:00:00.000Z',
						last_seen: '2020-01-01T00:00:00.000Z',
						cooldown_until: null,
						status: 'cooldown',
					},
				],
			}),
		);
		const lockPath = createTempPath(
			'lock-defaults',
			'agents.lock.json',
			JSON.stringify({ in_flight: [] }),
		);
		const queuePath = createTempPath('queue-defaults', 'queue.json', '{}');
		const report = await gcZombies(registryPath, lockPath, queuePath);
		expect(report.orphans.length).toBe(1);
		const store = createAgentRegistryStore(registryPath);
		const updated = await store.read();
		expect(updated.assignments).toHaveLength(0);
	});

	// a00069 S6: status:orphan always purges
	it('a00069 S6: status:orphan is always classified for force_release', () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments: [
				{
					task_id: 'task-orphan',
					agent_name: 'agent_orphan',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'leftover',
					adopted: false,
					assigned_at: '2026-06-01T00:00:00.000Z',
					last_seen: '2026-06-01T00:00:00.000Z',
					cooldown_until: null,
					status: 'orphan',
				},
			],
		};
		const report = classifyZombies(registry, { in_flight: [] }, now, 10);
		expect(report.orphans).toHaveLength(1);
		expect(report.orphans[0]!.reason).toBe('status_orphan');
		expect(report.orphans[0]!.recommendedAction).toBe('force_release');
	});

	// a00069 S6: adopted:false past 7d TTL
	it('a00069 S6: stale adopted:false past orphan TTL is force_release', () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments: [
				{
					task_id: 'task-stale-na',
					agent_name: 'agent_stale_na',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'never adopted',
					adopted: false,
					assigned_at: '2026-05-01T00:00:00.000Z',
					last_seen: '2026-05-01T00:00:00.000Z', // ~35d before now
					cooldown_until: null,
					status: 'active',
				},
			],
		};
		const report = classifyZombies(registry, { in_flight: [] }, now, 10);
		expect(report.orphans).toHaveLength(1);
		expect(report.orphans[0]!.reason).toBe('stale_not_adopted');
	});

	// a00069 S6: recent adopted:false is kept
	it('a00069 S6: recent adopted:false within TTL is kept', () => {
		const registry: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments: [
				{
					task_id: 'task-fresh-na',
					agent_name: 'agent_fresh_na',
					agent_slot: 'implementation_runner',
					parent_task_id: null,
					depth: 0,
					topic: 'just assigned',
					adopted: false,
					assigned_at: '2026-06-05T11:55:00.000Z',
					last_seen: '2026-06-05T11:55:00.000Z',
					cooldown_until: null,
					status: 'active',
				},
			],
		};
		const report = classifyZombies(registry, { in_flight: [] }, now, 10);
		expect(report.orphans).toEqual([]);
	});

	// a00069 S6: bulk purge 30 orphans via gcZombies
	it('a00069 S6: gcZombies purges a bulk of 30 orphan assignments', async () => {
		const assignments = Array.from({ length: 30 }, (_, i) => ({
			task_id: `task-o-${i}`,
			agent_name: `agent_o_${i}`,
			agent_slot: 'implementation_runner' as const,
			parent_task_id: null,
			depth: 0,
			topic: 'bulk',
			adopted: false,
			assigned_at: '2026-05-01T00:00:00.000Z',
			last_seen: '2026-05-01T00:00:00.000Z',
			cooldown_until: null,
			status: (i < 27 ? 'orphan' : 'active') as 'orphan' | 'active',
		}));
		const registryData: IAgentRegistry = {
			version: 1,
			adopted: [],
			assignments,
		};
		const registryPath = createTempPath(
			'reg-bulk',
			'subagent-registry.json',
			JSON.stringify(registryData),
		);
		const lockPath = createTempPath(
			'lock-bulk',
			'agents.lock.json',
			JSON.stringify({ version: 1, in_flight: [] }),
		);
		const report = await gcZombies(registryPath, lockPath, '', {
			dryRun: false,
			now,
		});
		expect(report.orphans).toHaveLength(30);
		const store = createAgentRegistryStore(registryPath);
		const after = await store.read();
		expect(after.assignments).toHaveLength(0);
	});
});
