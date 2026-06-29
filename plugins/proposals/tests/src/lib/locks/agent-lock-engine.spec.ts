/**
 * Unit specs for `runAgentLockEngine` (t00001 S1 / audit H2).
 *
 * The 412-line lock engine had no direct unit coverage — only the
 * f00044 e2e exercised it over the wire. These specs drive it directly
 * against a throwaway lock file (injected `deps.lockPath`, the
 * Dependency-Inversion seam), covering claim / refresh / conflict /
 * release / status / stale-GC / invalid-input without a server.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAgentLockEngine,
	type IAgentLockArgs,
	type IAgentLockDeps,
	type ILockFile,
} from '../../../../src/lib/locks/agent-lock-engine';

let workspace = '';
let lockPath = '';

const deps = (over: Partial<IAgentLockDeps> = {}): IAgentLockDeps => ({
	lockPath,
	toolName: 'proposals_agent_lock',
	lockFileLabel: '.cache/agents.lock.json',
	...over,
});

const run = (args: IAgentLockArgs, over: Partial<IAgentLockDeps> = {}) =>
	runAgentLockEngine(args, deps(over));

const body = (res: { content: Array<{ text: string }> }) =>
	JSON.parse(res.content[0]?.text ?? '{}');

const readLockFile = (): ILockFile =>
	JSON.parse(readFileSync(lockPath, 'utf8')) as ILockFile;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), 'agent-lock-'));
	lockPath = join(workspace, 'agents.lock.json');
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe('runAgentLockEngine — claim', async () => {
	it('requires an injected lock path instead of guessing the workspace', async () => {
		await expect(
			runAgentLockEngine({
				action: 'claim',
				task_id: 'task-A',
				agent: 'agent-A',
				files: ['src/a.ts'],
			}),
		).rejects.toThrow('deps.lockPath is required');
	});

	it('records a new claim with its file ownership', async () => {
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts', 'src/b.ts'],
		});
		expect(res.isError).not.toBe(true);
		expect(body(res).blocked).not.toBe(true);
		const lock = readLockFile();
		const entry = lock.in_flight.find((e) => e.task_id === 'task-A');
		expect(entry?.agent).toBe('agent-A');
		expect([...(entry?.ownership ?? [])].sort()).toEqual([
			'src/a.ts',
			'src/b.ts',
		]);
	});

	it('refreshes (not duplicates) a re-claim of the same task_id', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		expect(body(res).refreshed).toBe(true);
		expect(
			readLockFile().in_flight.filter((e) => e.task_id === 'task-A'),
		).toHaveLength(1);
	});

	it('blocks a claim whose files overlap another live task', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({
			action: 'claim',
			task_id: 'task-B',
			agent: 'agent-B',
			files: ['src/a.ts', 'src/c.ts'],
		});
		const out = body(res);
		expect(out.blocked).toBe(true);
		expect(out.blockerType).toBe('lock-conflict');
		expect(out.conflicting_task).toBe('task-A');
		expect(out.overlapping_files).toEqual(['src/a.ts']);
		// The blocked claim must NOT be persisted.
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'task-B'),
		).toBe(false);
	});

	it('rejects an invalid claim (missing files) as a structured error', async () => {
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
		});
		expect(res.isError).toBe(true);
		expect(body(res).blockerType).toBe('invalid-input');
	});
});

describe('runAgentLockEngine — release / status', async () => {
	it('release removes the task from the in-flight set', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		await run({ action: 'release', task_id: 'task-A' });
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'task-A'),
		).toBe(false);
	});

	it('status reports the current in-flight claims', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({ action: 'status' });
		const out = body(res);
		const inFlight = (out.in_flight ?? []) as Array<{ task_id: string }>;
		expect(inFlight.some((e) => e.task_id === 'task-A')).toBe(true);
	});
});

describe('runAgentLockEngine — stale GC', async () => {
	it('drops a claim older than stale_after_minutes on the next read', async () => {
		// Claim "10 minutes ago"; the default stale window evicts it.
		const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		await run(
			{
				action: 'claim',
				task_id: 'old-task',
				agent: 'agent-A',
				files: ['src/a.ts'],
			},
			{ now: () => past },
		);
		// A fresh status read removes the stale entry (removeStale).
		const res = await run({ action: 'status' });
		const inFlight = (body(res).in_flight ?? []) as Array<{
			task_id: string;
		}>;
		expect(inFlight.some((e) => e.task_id === 'old-task')).toBe(false);
	});
});
