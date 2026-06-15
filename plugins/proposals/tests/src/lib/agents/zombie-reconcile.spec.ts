import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	classifyZombies,
	gcZombies,
	thresholdFromOrphans,
} from '@cartago-git/mcp-proposals/lib/agents/zombie-reconcile';
import type {
	IAgentSlot,
	IZombieOrphanEntry,
	IZombieReconcileReport,
	IZombieThreshold,
} from '@cartago-git/mcp-proposals/lib/agents/zombie-reconcile';
import { createAgentRegistryStore } from '@cartago-git/mcp-proposals/lib/shared/agent-registry-store';
import type { IAgentRegistry } from '@cartago-git/mcp-proposals/lib/shared/agent-registry-store';

const TEMP_DIRS: string[] = [];

const createTempPath = (
	prefix: string,
	filename: string,
	content: string
): string => {
	const dir = mkdtempSync(join(tmpdir(), `affairs-test-${prefix}-`));
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

describe('zombie-reconcile', () => {
	const now = new Date('2026-06-05T12:00:00.000Z');

	// 1. Registry vacío + lock vacío
	it('Case 1: Registry vacío + lock vacío', () => {
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
	it('Case 2: Entry: adopted: true, status: "cooldown", cooldown_until: null, last_seen > 10 min, sin entrada en lock', () => {
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
	it('Case 3: Entry con entrada activa en lock.in_flight (mismo task_id)', () => {
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
	it('Case 4: Entry con status: "active" (not stale)', () => {
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
			JSON.stringify(registryData)
		);
		const lockPath = createTempPath(
			'lock',
			'agents.lock.json',
			JSON.stringify(lockData)
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
		expect(queueEmitter).toHaveBeenCalledTimes(1);
		expect(queueEmitter).toHaveBeenCalledWith('zombie-gc-event-task-1', 4);

		// Verify registry actually updated (entry removed)
		const store = createAgentRegistryStore(registryPath);
		const updatedRegistry = await store.read();
		expect(
			updatedRegistry.assignments.find((a: any) => a.task_id === 'task-1')
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
			JSON.stringify(registryData)
		);
		const lockPath = createTempPath(
			'lock',
			'agents.lock.json',
			JSON.stringify(lockData)
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
		expect(queueEmitter).toHaveBeenCalledTimes(1); // Emitter only called once
	});

	// 7. Backpressure event emission cuando orphans.length >= 1
	it('Case 7: Backpressure event emission cuando orphans.length >= 1', async () => {
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
			JSON.stringify(registryData)
		);
		const lockPath = createTempPath(
			'lock',
			'agents.lock.json',
			JSON.stringify(lockData)
		);
		const queuePath = createTempPath('queue', 'queue.json', '{}');

		const queueEmitter = vi
			.fn()
			.mockImplementation(() => Promise.resolve());

		await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now,
			queueEmitter,
		});

		expect(queueEmitter).toHaveBeenCalledWith(
			expect.stringContaining('zombie-gc-event-'),
			4
		);
	});

	// 8. Threshold verde: 0 orphans
	it('Case 8: Threshold verde: 0 orphans', () => {
		expect(thresholdFromOrphans(0)).toBe('green');
	});

	// 9. Threshold amarillo: 1–2 orphans
	it('Case 9: Threshold amarillo: 1–2 orphans', () => {
		expect(thresholdFromOrphans(1)).toBe('yellow');
		expect(thresholdFromOrphans(2)).toBe('yellow');
	});

	// 10. Threshold rojo: >= 3 orphans
	it('Case 10: Threshold rojo: >= 3 orphans', () => {
		expect(thresholdFromOrphans(3)).toBe('red');
		expect(thresholdFromOrphans(10)).toBe('red');
	});

	// 11. Entry con adopted: false, cooldown_until: null
	it('Case 11: Entry con adopted: false, cooldown_until: null', () => {
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

	// 12. Entry con cooldown_until: null pero last_seen hace sólo 2 minutos
	it('Case 12: Entry con cooldown_until: null pero last_seen hace sólo 2 minutos', () => {
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

	// Recommended Case: Entry con entrada en lock.in_flight que también es rancia (stale lock)
	it('Recommended Case: Entry con entrada en lock.in_flight que también es rancia (stale lock)', () => {
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
});
