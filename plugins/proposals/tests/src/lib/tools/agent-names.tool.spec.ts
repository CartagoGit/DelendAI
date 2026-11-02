/**
 * agent-names.tool.spec.ts — the agent name registry, action by action, on
 * a real registry file.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	type IAgentNamesArgs,
	type IAgentNamesToolOptions,
	runAgentNames,
} from '@delendai/proposals/lib/tools/agent-names.tool';

let root = '';
let options: IAgentNamesToolOptions;
const released: string[] = [];

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'agent-names-'));
	released.length = 0;
	options = {
		namespacePrefix: 'proposals',
		registryPathAbs: join(root, 'registry.json'),
		lockPathAbs: join(root, 'agents.lock.json'),
		queuePathAbs: join(root, 'queue.json'),
		closedTasksPathAbs: join(root, 'closed.json'),
		workspaceRoot: root,
		pool: ['ada', 'bea'],
		onAgentReleased: (name) => {
			released.push(name);
		},
	};
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const NOW = '2026-09-29T09:00:00.000Z';

const call = async (
	args: Partial<IAgentNamesArgs> & { action: IAgentNamesArgs['action'] },
): Promise<{ body: Record<string, unknown>; isError: boolean }> => {
	const result = await runAgentNames({ now: NOW, ...args }, options);
	return {
		body: JSON.parse(result.content[0]?.text ?? '{}'),
		isError: (result as { isError?: boolean }).isError === true,
	};
};

describe('agent_names', () => {
	it('assigns pool names, keeps a lease alive, lists and releases', async () => {
		const first = await call({
			action: 'assign',
			task_id: 'f00001-S1',
			agent_slot: 'orchestrator',
			topic: 'plan',
		});
		expect(first.body.agent_name).toBe('ada');
		const child = await call({
			action: 'assign',
			task_id: 'f00001-S2',
			agent_slot: 'implementation_runner',
			parent_task_id: 'f00001-S1',
			agent: 'bea',
		});
		expect(child.body).toMatchObject({ agent_name: 'bea', depth: 1 });

		const taken = await call({
			action: 'assign',
			task_id: 'f00002-S1',
			agent_slot: 'implementation_runner',
			agent: 'bea',
		});
		expect(taken).toMatchObject({
			isError: true,
			body: { reason: 'cooldown_or_taken' },
		});
		expect(
			(
				await call({
					action: 'assign',
					task_id: 'f00002-S1',
					agent_slot: 'implementation_runner',
				})
			).body,
		).toMatchObject({ error: 'pool_exhausted' });

		const beat = await call({
			action: 'heartbeat',
			task_id: 'f00001-S1',
			subscription_id: first.body.subscription_id as string,
		});
		expect(beat.body.task_id).toBe('f00001-S1');
		expect(
			(
				await call({
					action: 'heartbeat',
					task_id: 'f00001-S1',
					subscription_id: 'someone-else',
				})
			).body.error,
		).toBe('subscription_id mismatch');

		const listed = await call({ action: 'list' });
		expect(listed.body.summary).toMatchObject({ active: 2 });
		expect(
			(listed.body.assignments as { agent_name: string }[]).map(
				(a) => a.agent_name,
			),
		).toEqual(['ada', 'bea']);
		const tree = await call({ action: 'tree' });
		expect(tree.body.tree).toBeDefined();

		expect(
			(await call({ action: 'who_uses', agent: 'ada' })).body,
		).toMatchObject({ status: 'active', task_id: 'f00001-S1' });

		const gone = await call({ action: 'release', task_id: 'f00001-S1' });
		expect(gone.body.released).toEqual(['f00001-S1', 'f00001-S2']);
		expect(released.sort()).toEqual(['ada', 'bea']);
		expect(
			(await call({ action: 'who_uses', agent: 'ada' })).body,
		).toMatchObject({ in_cooldown: true });
		const detailed = await call({ action: 'list', detail: true });
		expect(detailed.body.summary).toMatchObject({ active: 0 });
		expect(detailed.body.assignments).toHaveLength(2);
	});

	it('adopts a name outside the pool and reports on it', async () => {
		const adopted = await call({
			action: 'assign',
			task_id: 'f00003-S1',
			agent_slot: 'delivery_verifier',
			agent: 'outsider',
		});
		expect(adopted.body).toMatchObject({
			agent_name: 'outsider',
			adopted: true,
		});
		const who = await call({ action: 'who_uses', agent: 'outsider' });
		expect(who.isError).toBe(false);
		expect(
			(await call({ action: 'who_uses', agent: 'bea' })).body,
		).toMatchObject({ agent: 'bea' });
	});

	it('refuses what it cannot act on', async () => {
		expect((await call({ action: 'assign', task_id: 'x' })).isError).toBe(
			true,
		);
		expect(
			(await call({ action: 'assign', task_id: 'x', agent_slot: 'boss' }))
				.body.error,
		).toBe('agent_slot must be a canonical role');
		expect((await call({ action: 'heartbeat' })).isError).toBe(true);
		expect(
			(await call({ action: 'heartbeat', task_id: 'nobody' })).body.error,
		).toBe('unknown task_id');
		expect((await call({ action: 'release' })).isError).toBe(true);
		expect(
			(await call({ action: 'release', task_id: 'nobody' })).body
				.released,
		).toEqual([]);
		expect((await call({ action: 'who_uses' })).isError).toBe(true);
	});

	it('collects stale agents and reconciles the registry', async () => {
		await call({
			action: 'assign',
			task_id: 'f00004-S1',
			agent_slot: 'orchestrator',
		});
		const later = '2026-09-30T09:00:00.000Z';
		const gc = await call({
			action: 'gc',
			now: later,
			stale_after_minutes: 5,
		});
		expect(gc.isError).toBe(false);
		const reconciled = await call({
			action: 'reconcile',
			now: later,
			dry_run: true,
		});
		expect(reconciled.isError).toBe(false);
	});

	it('says the registry is corrupt instead of acting on a blank one', async () => {
		writeFileSync(options.registryPathAbs, '{ not json');
		const answer = await call({ action: 'list' });
		expect(answer.isError).toBe(true);
		expect(String(answer.body.error)).toContain('corrupt');
	});
});
