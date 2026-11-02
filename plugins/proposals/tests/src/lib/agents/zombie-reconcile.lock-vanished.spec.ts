import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IAgentRegistry } from '@delendai/proposals/lib/shared/agent-registry-store';

// The release reports that it removed nothing and, in the same breath, the
// lock file is gone: the purge in the engine took the entry and the
// rewrite failed. Nothing is left holding the lock, so the reconcile has
// to count it as released and tell the watchdog.
vi.mock('@delendai/proposals/lib/locks/agent-lock-engine', () => ({
	runAgentLockEngine: vi.fn(
		async (_input: unknown, options: { readonly lockPath: string }) => {
			rmSync(options.lockPath, { force: true });
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ ok: true, removed: 0 }),
					},
				],
			};
		},
	),
}));

const { gcZombies } = await import(
	'@delendai/proposals/lib/agents/zombie-reconcile'
);

const TEMP_DIRS: string[] = [];

const tempFile = (filename: string, content: string): string => {
	const dir = mkdtempSync(join(tmpdir(), 'delendai-zombie-vanished-'));
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

describe('zombie-reconcile — lock gone after the release', () => {
	it('counts the lock as released and emits the watchdog event', async () => {
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
		const lock = {
			version: 1,
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'task-1',
					agent: 'agent_zombie',
					ownership: ['packages/proposals/src/foo.ts'],
					started_at: '2026-06-05T11:00:00.000Z',
					last_seen: '2026-06-05T11:30:00.000Z',
					host: 'dead-host',
					pid: 999999,
				},
			],
		};
		const registryPath = tempFile(
			'subagent-registry.json',
			JSON.stringify(registry),
		);
		const lockPath = tempFile('agents.lock.json', JSON.stringify(lock));
		const queuePath = tempFile('queue.json', '{}');
		const queueEmitter = vi.fn(() => Promise.resolve());

		const report = await gcZombies(registryPath, lockPath, queuePath, {
			dryRun: false,
			staleAfterMinutes: 10,
			now: new Date('2026-06-05T12:00:00.000Z'),
			queueEmitter,
		});

		expect(report.releasedLockCount).toBe(1);
		expect(queueEmitter).toHaveBeenCalledWith('zombie-gc-event-task-1', 4);
	});
});
