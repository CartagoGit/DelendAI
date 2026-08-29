import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	runAutoStateRepairOnBoot,
	runStateRepair,
} from '@mcp-vertex/proposals/lib/tools/state-tools.tool';
import type { IPluginLogInput } from '@mcp-vertex/core/public';

const emptyLock: { version: number; in_flight: unknown[] } = {
	version: 1,
	in_flight: [],
};
const emptyQueue: { version: number; entries: unknown[] } = {
	version: 1,
	entries: [],
};

describe('a00069 S10 auto state_repair on boot', () => {
	let root = '';
	let lockPath = '';
	let queuePath = '';
	let closedPath = '';
	let registryPath = '';
	let logSpy: ReturnType<
		typeof vi.fn<(input: IPluginLogInput) => Promise<void>>
	>;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'a00069-s10-'));
		lockPath = join(root, 'locks.json');
		queuePath = join(root, 'queue.json');
		closedPath = join(root, 'closed.json');
		registryPath = join(root, 'registry.json');
		await writeFile(lockPath, JSON.stringify(emptyLock));
		await writeFile(queuePath, JSON.stringify(emptyQueue));
		await writeFile(closedPath, JSON.stringify({ version: 1, closed: [] }));
		// 2 explicit orphan assignments past TTL
		const old = new Date(
			Date.now() - 10 * 24 * 60 * 60 * 1000,
		).toISOString();
		await writeFile(
			registryPath,
			JSON.stringify({
				version: 1,
				adopted: [],
				assignments: [
					{
						task_id: 't1',
						agent_name: 'zombie-a',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 'leftover',
						adopted: false,
						assigned_at: old,
						last_seen: old,
						cooldown_until: null,
						status: 'orphan',
					},
					{
						task_id: 't2',
						agent_name: 'zombie-b',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 'never adopted',
						adopted: false,
						assigned_at: old,
						last_seen: old,
						cooldown_until: null,
						status: 'active',
					},
				],
			}),
		);
		logSpy = vi
			.fn<(input: IPluginLogInput) => Promise<void>>()
			.mockResolvedValue(undefined);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const opts = () => ({
		namespacePrefix: 'mcp-vertex_proposals',
		lockPathAbs: lockPath,
		queuePathAbs: queuePath,
		closedTasksPathAbs: closedPath,
		registryPathAbs: registryPath,
		workspaceRoot: root,
		logs: { log: logSpy },
	});

	it('runStateRepair purges orphan assignments', async () => {
		const repaired = await runStateRepair(opts());
		expect(repaired.orphanAssignments).toBeGreaterThan(0);
		const reg = JSON.parse(await readFile(registryPath, 'utf8')) as {
			assignments: unknown[];
		};
		expect(reg.assignments).toHaveLength(0);
		expect(repaired.diagnosis.registry.orphans).toBe(0);
	});

	it('runAutoStateRepairOnBoot logs state-repair-auto and heals', async () => {
		// a00069 S10: the function returns the pending promise so tests can
		// await it deterministically (no vi.waitFor — bun test has no
		// vi.waitFor under the vitest shim). The boot path still fires it
		// without awaiting by ignoring the returned promise.
		await runAutoStateRepairOnBoot(opts());
		const reg = JSON.parse(await readFile(registryPath, 'utf8')) as {
			assignments: unknown[];
		};
		expect(reg.assignments).toHaveLength(0);
		// x00156 S2: the event now goes through ctx.logs.log(...) (the
		// structured incident stream) instead of console.info, so
		// logs/errors_tail can actually see a state-repair-auto event.
		expect(logSpy).toHaveBeenCalledTimes(1);
		const [input] = logSpy.mock.calls[0] as [
			{
				severity: string;
				incidentType: string;
				context?: { orphanAssignments?: number };
			},
		];
		expect(input.incidentType).toBe('state-repair-auto');
		expect(input.severity).toBe('warning');
		expect(input.context?.orphanAssignments).toBeGreaterThan(0);
	});

	it('reports a failed repair through logs.log with severity error', async () => {
		// Point at a registry path that cannot be read as JSON to force
		// the catch branch.
		await writeFile(registryPath, 'not json');
		await runAutoStateRepairOnBoot(opts());
		expect(logSpy).toHaveBeenCalledTimes(1);
		const [input] = logSpy.mock.calls[0] as [
			{ severity: string; incidentType: string },
		];
		expect(input.incidentType).toBe('state-repair-auto');
		expect(input.severity).toBe('error');
	});

	it('does not throw when no logs helper is provided (optional dependency)', async () => {
		const { logs: _logs, ...rest } = opts();
		await expect(runAutoStateRepairOnBoot(rest)).resolves.toBeUndefined();
	});
});
