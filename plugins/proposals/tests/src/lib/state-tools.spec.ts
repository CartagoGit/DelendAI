import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import {
	resetAgentLockSessionBalance,
	runAgentLockEngine,
} from '@delendai/proposals/lib/locks/agent-lock-engine';
import {
	recordPeerReviewBypass,
	resetPeerReviewBypassLog,
} from '@delendai/proposals/lib/shared/peer-review-bypass-log';
import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
	type IStateToolOptions,
} from '@delendai/proposals/lib/tools/state-tools.tool';

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
		resetPeerReviewBypassLog();
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
		expect(out.locks.stale).toBe(0);
		expect(out.locks.livelocks).toBe(0);
		expect(out.locks.livelockPairs).toEqual([]);
		expect(out.locks.staleTaskIds).toEqual([]);
		expect(out.locks.sessionBalance).toEqual({
			claims: 0,
			releases: 0,
			imbalance: 0,
		});
		expect(out.locks.sessionClaims).toBe(0);
		expect(out.locks.sessionReleases).toBe(0);
		expect(out.locks.sessionImbalance).toBe(0);
		expect(out.stale).toEqual({
			count: 0,
			taskIds: [],
			lastStaleSeen: null,
		});
		expect(out.heartbeatStalls).toEqual({ count: 0, taskIds: [] });
		expect(out.peerReviewBypasses).toBe(0);
		expect(out.autoTransitionRepairs).toEqual({ count: 0, entries: [] });
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
		expect(out.locks.sessionBalance).toEqual({
			claims: 6,
			releases: 0,
			imbalance: 6,
		});
		expect(out.healthy).toBe(false);
	});

	it('reads persisted session imbalance from the JSONL store', async () => {
		mkdirSync(join(dir, '.cache/mcp-vertex'), { recursive: true });
		writeFileSync(
			join(dir, '.cache/mcp-vertex/agents.lock.session.jsonl'),
			`${[
				JSON.stringify({
					ts: '2026-07-26T00:00:00.000Z',
					agent: 'alpha',
					action: 'claim',
					ok: true,
				}),
				JSON.stringify({
					ts: '2026-07-26T00:00:01.000Z',
					agent: 'alpha',
					action: 'release',
					ok: true,
				}),
				JSON.stringify({
					ts: '2026-07-26T00:00:02.000Z',
					agent: 'beta',
					action: 'claim',
					ok: true,
				}),
			].join('\n')}\n`,
		);
		const handler = await capture(buildStateHealthRegistration(opts));
		const out = parse(await handler({}));
		expect(out.locks.sessionBalance).toEqual({
			claims: 2,
			releases: 1,
			imbalance: 1,
		});
		expect(out.locks.sessionImbalance).toBe(1);
	});

	it('a00069 S11: surfaces peerReviewBypasses session count', async () => {
		recordPeerReviewBypass({
			proposalId: 'f-s11',
			reason: 'emergency',
			via: 'force',
		});
		const handler = await capture(buildStateHealthRegistration(opts));
		const out = parse(await handler({}));
		expect(out.peerReviewBypasses).toBe(1);
	});

	it('reports stale locks before counting active ones and repairs them on execute', async () => {
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'falcon',
						ownership: ['src/a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 'f00126-S4',
						agent: 'hawk',
						ownership: ['src/b.ts'],
						started_at: '2999-01-01T00:00:00.000Z',
						last_seen: '2999-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const healthOut = parse(await health({}));
		expect(healthOut.healthy).toBe(false);
		expect(healthOut.locks.active).toBe(1);
		expect(healthOut.locks.stale).toBe(1);
		expect(healthOut.locks.staleTaskIds).toEqual(['f00126-S3']);
		expect(healthOut.locks.lastStaleSeen).toBe('2000-01-01T00:00:00.000Z');
		expect(healthOut.stale).toEqual({
			count: 1,
			taskIds: ['f00126-S3'],
			lastStaleSeen: '2000-01-01T00:00:00.000Z',
		});

		const repair = await capture(buildStateRepairRegistration(opts));
		const dry = parse(await repair({}));
		expect(dry.mode).toBe('dry-run');
		expect(dry.wouldRepair.staleLocks).toBe(1);

		const exec = parse(await repair({ mode: 'execute' }));
		expect(exec.mode).toBe('execute');
		expect(exec.repaired.staleLocks).toBe(1);
		expect(exec.diagnosis.locks.active).toBe(1);
		expect(exec.diagnosis.locks.stale).toBe(0);
		expect(exec.diagnosis.locks.staleTaskIds).toEqual([]);
		expect(exec.diagnosis.stale).toEqual({
			count: 0,
			taskIds: [],
			lastStaleSeen: null,
		});
	});

	it('a00072 S1.a (F148/F151): state_health surfaces stale locks with taskIds + lastStaleSeen', async () => {
		// Two stale entries + one fresh → diagnose must report
		// stale.count === 2 and stale.taskIds matching both.
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		const freshTs = new Date().toISOString();
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 't-stale-1',
						agent: 'zombie-1',
						ownership: ['src/old-1.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 't-fresh',
						agent: 'alive',
						ownership: ['src/new.ts'],
						started_at: freshTs,
						last_seen: freshTs,
					},
					{
						task_id: 't-stale-2',
						agent: 'zombie-2',
						ownership: ['src/old-2.ts'],
						started_at: '2001-06-15T12:00:00.000Z',
						last_seen: '2001-06-15T12:00:00.000Z',
					},
				],
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const out = parse(await health({}));
		// The new a00072 S1.a smoke-detector surface.
		expect(out.stale).toBeDefined();
		expect(out.stale.count).toBe(2);
		expect(out.stale.taskIds).toContain('t-stale-1');
		expect(out.stale.taskIds).toContain('t-stale-2');
		expect(out.stale.taskIds).not.toContain('t-fresh');
		expect(out.stale.lastStaleSeen).toBe('2001-06-15T12:00:00.000Z'); // most recent of the two
		// Stale entries must fail the health gate (F151 closed).
		expect(out.healthy).toBe(false);
	});

	it('surfaces a stalled heartbeat before the conservative stale-lock TTL', async () => {
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		const stalled = new Date(Date.now() - 31_000).toISOString();
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'heartbeat-stalled',
						agent: 'runner',
						ownership: ['src/held.ts'],
						started_at: stalled,
						last_seen: stalled,
					},
				],
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const out = parse(await health({}));
		expect(out.heartbeatStalls).toEqual({
			count: 1,
			taskIds: ['heartbeat-stalled'],
		});
		expect(out.stale.count).toBe(0);
		expect(out.healthy).toBe(false);
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

	it('a00072 S8.c: state_health reports livelock pairs from overlapping claims', async () => {
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 't-a',
						agent: 'alpha',
						ownership: ['src/shared.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2999-01-01T00:00:00.000Z',
					},
					{
						task_id: 't-b',
						agent: 'beta',
						ownership: ['src/shared.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2999-01-01T00:00:00.000Z',
					},
				],
			}),
		);
		writeFileSync(
			join(dirname(opts.lockPathAbs), 'file-locks.json'),
			JSON.stringify({
				'src/shared.ts': {
					agentId: 'alpha',
					mtime: '2000-01-01T00:00:00.000Z',
					taskId: 't-a',
				},
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const out = parse(await health({}));
		expect(out.locks.livelocks).toBe(1);
		expect(out.locks.livelockPairs).toEqual([
			{
				agentA: 'alpha',
				agentB: 'beta',
				files: ['src/shared.ts'],
				heldMs: expect.any(Number),
			},
		]);
		expect(out.healthy).toBe(false);
	});
});

describe('state_health a00072 S1.a (F148/F151) [N15]', () => {
	let dir = '';
	let opts: IStateToolOptions;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'state-s1a-'));
		resetAgentLockSessionBalance();
		resetPeerReviewBypassLog();
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
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('surfaces stale locks the smoke detector sees right now (F148)', async () => {
		// a00072 S1.a: state_health must report stale locks as part
		// of the snapshot, without the host first having to call
		// state_repair.
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-perf-s3',
						ownership: ['src/a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const h = parse(await health({}));

		expect(h.stale.count).toBe(1);
		expect(h.stale.taskIds).toEqual(['f00126-S3']);
		expect(h.stale.lastStaleSeen).toBe('2000-01-01T00:00:00.000Z');
		// a00072 S1.a: the smoke detector must FAIL the health gate
		// when stale locks exist (they would be GC'd by state_repair).
		expect(h.healthy).toBe(false);
		// The smoke detector must NOT have touched the lock file.
		const after = JSON.parse(
			require('node:fs').readFileSync(opts.lockPathAbs, 'utf8'),
		);
		expect(after.in_flight).toHaveLength(1);
	});

	it('reports zero stale when the lock file is empty (F148)', async () => {
		const health = await capture(buildStateHealthRegistration(opts));
		const h = parse(await health({}));
		expect(h.stale.count).toBe(0);
		expect(h.stale.taskIds).toEqual([]);
		expect(h.stale.lastStaleSeen).toBe(null);
	});

	it('does not flag fresh locks as stale (F148)', async () => {
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		const freshNow = new Date().toISOString();
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'live-task',
						agent: 'copilot',
						ownership: ['src/a.ts'],
						started_at: freshNow,
						last_seen: freshNow,
					},
				],
			}),
		);

		const health = await capture(buildStateHealthRegistration(opts));
		const h = parse(await health({}));
		expect(h.stale.count).toBe(0);
		expect(h.stale.taskIds).toEqual([]);
	});

	it('state_repair still GCs the same stale lock (compatibility, F151)', async () => {
		// a00072 S1.a: state_health surfaces the smoke; state_repair
		// is the only one that writes. Make sure the two still agree.
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

		const health = await capture(buildStateHealthRegistration(opts));
		const h = parse(await health({}));
		expect(h.stale.count).toBe(1);

		const repair = await capture(buildStateRepairRegistration(opts));
		const exec = parse(await repair({ mode: 'execute' }));
		expect(exec.repaired.staleLocks).toBeGreaterThanOrEqual(1);
		expect(exec.diagnosis.stale.count).toBe(0);
		expect(exec.diagnosis.healthy).toBe(true);
	});
});
