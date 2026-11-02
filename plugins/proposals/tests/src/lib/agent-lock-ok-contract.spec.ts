/**
 * a00069 S8 — agent_lock always returns ok + session claim/release balance.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	getAgentLockSessionBalance,
	resetAgentLockSessionBalance,
	runAgentLockEngine,
} from '@delendai/proposals/lib/locks/agent-lock-engine';

const parse = (r: { content: Array<{ text: string }> }) =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('agent_lock ok contract (a00069 S8)', () => {
	let lockPath = '';
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'lock-ok-'));
		lockPath = join(root, 'agents.lock.json');
		resetAgentLockSessionBalance();
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const deps = () => ({
		lockPath,
		toolName: 'proposals_agent_lock',
		lockFileLabel: 'agents.lock.json',
	});

	it('claim success includes ok:true and increments session claims', async () => {
		const body = parse(
			await runAgentLockEngine(
				{
					action: 'claim',
					task_id: 't1',
					agent: 'alice',
					files: ['src/a.ts'],
				},
				deps(),
			),
		);
		expect(body.ok).toBe(true);
		expect(body.claimed).toBe(true);
		expect(body.session.claims).toBe(1);
		expect(body.session.releases).toBe(0);
		expect(body.session.imbalance).toBe(1);
		expect((await getAgentLockSessionBalance()).imbalance).toBe(1);
	});

	it('release success decrements imbalance', async () => {
		await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 't1',
				agent: 'alice',
				files: ['src/a.ts'],
			},
			deps(),
		);
		const body = parse(
			await runAgentLockEngine(
				{ action: 'release', task_id: 't1' },
				deps(),
			),
		);
		expect(body.ok).toBe(true);
		expect(body.session.claims).toBe(1);
		expect(body.session.releases).toBe(1);
		expect(body.session.imbalance).toBe(0);
	});

	it('lock-conflict returns ok:false and points at await_lock', async () => {
		await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 't1',
				agent: 'alice',
				files: ['src/a.ts'],
			},
			deps(),
		);
		const res = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 't2',
				agent: 'bob',
				files: ['src/a.ts'],
			},
			deps(),
		);
		const body = parse(res);
		expect(body.ok).toBe(false);
		expect(body.blocked).toBe(true);
		expect(String(body.nextAction ?? '')).toMatch(
			/await_lock|lock-released|notify_status/i,
		);
	});

	it('status always has ok boolean', async () => {
		const body = parse(
			await runAgentLockEngine({ action: 'status' }, deps()),
		);
		expect(typeof body.ok).toBe('boolean');
		expect(body.ok).toBe(true);
	});
});
