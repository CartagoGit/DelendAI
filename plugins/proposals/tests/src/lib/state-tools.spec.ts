import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	resetAgentLockSessionBalance,
	runAgentLockEngine,
} from '@mcp-vertex/proposals/lib/locks/agent-lock-engine';
import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
	type IStateToolOptions,
} from '@mcp-vertex/proposals/lib/tools/state-tools.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('state_health / state_repair [N15]', async () => {
	let dir = '';
	let opts: IStateToolOptions;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'state-'));
		resetAgentLockSessionBalance();
		opts = {
			namespacePrefix: 'proposals',
			lockPathAbs: join(dir, '.cache/agents.lock.json'),
			queuePathAbs: join(dir, '.cache/agent-queue/queue.json'),
			closedTasksPathAbs: join(
				dir,
				'.cache/agent-queue/closed-tasks.json',
			),
			registryPathAbs: join(dir, '.cache/agent-registry.json'),
			workspaceRoot: dir,
		};
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('reports healthy on an empty workspace', async () => {
		const handler = await capture(buildStateHealthRegistration(opts));
		const out = parse(await handler({}));
		expect(out.healthy).toBe(true);
		expect(out.locks.active).toBe(0);
		expect(out.locks.sessionClaims).toBe(0);
		expect(out.locks.sessionReleases).toBe(0);
		expect(out.locks.sessionImbalance).toBe(0);
		expect(out.registry.orphans).toBe(0);
	});

	it('a00069 S8: surfaces claim/release session imbalance and fails health when > 5', async () => {
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		// Six successful claims without matching releases → imbalance 6 > 5.
		for (let i = 0; i < 6; i += 1) {
			const res = await runAgentLockEngine(
				{
					action: 'claim',
					task_id: `t-s8-${i}`,
					agent: 's8',
					files: [`src/s8-${i}.ts`],
				},
				{ lockPath: opts.lockPathAbs },
			);
			expect(res.isError).not.toBe(true);
		}
		const handler = await capture(buildStateHealthRegistration(opts));
		const out = parse(await handler({}));
		expect(out.locks.sessionClaims).toBe(6);
		expect(out.locks.sessionReleases).toBe(0);
		expect(out.locks.sessionImbalance).toBe(6);
		expect(out.healthy).toBe(false);
	});

	it('flags a stale lock and repairs it on execute', async () => {
		// A claim whose last_seen is far in the past → stale.
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 't-old',
						agent: 'falcon',
						ownership: ['src/a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const repair = await capture(buildStateRepairRegistration(opts));
		const dry = parse(await repair({}));
		expect(dry.mode).toBe('dry-run');

		const exec = parse(await repair({ mode: 'execute' }));
		expect(exec.mode).toBe('execute');
		expect(exec.repaired.staleLocks).toBeGreaterThanOrEqual(1);
		expect(exec.diagnosis.locks.active).toBe(0);
	});

	it('a00069 S6: dry-run lists orphan assignments; execute purges them', async () => {
		mkdirSync(dirname(opts.registryPathAbs), { recursive: true });
		const assignments = Array.from({ length: 5 }, (_, i) => ({
			task_id: `t-o-${i}`,
			agent_name: `agent_o_${i}`,
			agent_slot: 'implementation_runner',
			parent_task_id: null,
			depth: 0,
			topic: 'stale',
			adopted: false,
			assigned_at: '2020-01-01T00:00:00.000Z',
			last_seen: '2020-01-01T00:00:00.000Z',
			cooldown_until: null,
			status: i % 2 === 0 ? 'orphan' : 'active',
		}));
		writeFileSync(
			opts.registryPathAbs,
			JSON.stringify({ version: 1, adopted: [], assignments }),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const h = parse(await health({}));
		expect(h.healthy).toBe(false);
		expect(h.registry.orphans).toBe(5);

		const repair = await capture(buildStateRepairRegistration(opts));
		const dry = parse(await repair({ mode: 'dry-run' }));
		expect(dry.wouldRepair.orphanAssignments).toBe(5);

		const exec = parse(await repair({ mode: 'execute' }));
		expect(exec.repaired.orphanAssignments).toBe(5);
		expect(exec.diagnosis.registry.orphans).toBe(0);
		expect(exec.diagnosis.healthy).toBe(true);

		const after = JSON.parse(
			require('node:fs').readFileSync(opts.registryPathAbs, 'utf8'),
		);
		expect(after.assignments).toEqual([]);
	});
});
