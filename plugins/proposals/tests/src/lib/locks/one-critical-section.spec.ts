/**
 * one-critical-section.spec.ts — a claim is decided and written in one
 * critical section, by the agent that holds it, and reported only once
 * it is on disk.
 */
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	cleanupStaleAgentLockState,
	runAgentLockEngine,
	type ILockFile,
} from '@delendai/proposals/lib/locks/agent-lock-engine';

const NOW = '2026-10-24T12:00:00.000Z';

let dir = '';
let lockPath = '';

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'one-section-'));
	lockPath = join(dir, '.cache/agents.lock.json');
});

afterEach(() => {
	chmodSync(join(dir, '.cache'), 0o755);
	rmSync(dir, { recursive: true, force: true });
});

const claim = (taskId: string, agent: string, files: readonly string[]) =>
	runAgentLockEngine(
		{ action: 'claim', task_id: taskId, agent, files: [...files] },
		{ lockPath, now: () => NOW },
	);

const answer = (result: { readonly content: readonly { text?: string }[] }) =>
	JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

const lockOnDisk = (): ILockFile =>
	JSON.parse(readFileSync(lockPath, 'utf8')) as ILockFile;

const tableOnDisk = (): Record<string, { readonly taskId?: string }> =>
	(
		JSON.parse(
			readFileSync(join(dir, '.cache/file-locks.json'), 'utf8'),
		) as { locks: Record<string, { readonly taskId?: string }> }
	).locks;

describe('a claim and a purge racing for the same files', () => {
	it('leave exactly one claim on the contested file and lose no live one', async () => {
		mkdirSync(join(dir, '.cache'), { recursive: true });
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'live',
						agent: 'agent-live',
						ownership: ['src/live.ts'],
						started_at: NOW,
						last_seen: NOW,
					},
					{
						task_id: 'gone',
						agent: 'agent-gone',
						ownership: ['src/gone.ts'],
						started_at: '2026-10-24T09:00:00.000Z',
						last_seen: '2026-10-24T09:00:00.000Z',
					},
				],
			}),
		);

		const [first, second] = await Promise.all([
			claim('a', 'agent-a', ['src/contested.ts']),
			claim('b', 'agent-b', ['src/contested.ts']),
			cleanupStaleAgentLockState({ lockPath, now: () => NOW }),
		]);

		const granted = [answer(first), answer(second)].filter(
			(body) => body.claimed === true,
		);
		expect(granted).toHaveLength(1);
		const holders = lockOnDisk()
			.in_flight.filter((entry) =>
				entry.ownership.includes('src/contested.ts'),
			)
			.map((entry) => entry.task_id);
		expect(holders).toEqual([granted[0]?.task_id]);
		expect(tableOnDisk()['src/contested.ts']?.taskId).toBe(
			granted[0]?.task_id,
		);
		const kept = lockOnDisk().in_flight.map((entry) => entry.task_id);
		expect(kept).toContain('live');
		expect(kept).not.toContain('gone');
	});
});

describe('a second agent naming a task another holds', () => {
	it('is refused, and the holder keeps its files', async () => {
		await claim('task-1', 'agent-a', ['src/one.ts']);

		const taken = answer(await claim('task-1', 'agent-b', ['src/two.ts']));

		expect(taken).toMatchObject({
			blocked: true,
			blockerType: 'lock-conflict',
			conflicting_agent: 'agent-a',
		});
		const entry = lockOnDisk().in_flight.find(
			(each) => each.task_id === 'task-1',
		);
		expect(entry?.agent).toBe('agent-a');
		expect(entry?.ownership).toEqual(['src/one.ts']);
		expect(Object.keys(tableOnDisk())).toEqual(['src/one.ts']);
	});
});

describe('a claim whose write fails', () => {
	it('is an error, not ok, and leaves no file held', async () => {
		const tableDir = join(dir, 'table');
		mkdirSync(tableDir, { recursive: true });
		mkdirSync(join(dir, '.cache'), { recursive: true });
		// The table can be written, the lock file cannot.
		chmodSync(join(dir, '.cache'), 0o555);
		const tablePath = join(tableDir, 'file-locks.json');

		const result = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-1',
				agent: 'agent-a',
				files: ['src/one.ts'],
			},
			{ lockPath, fileLockTablePath: tablePath, now: () => NOW },
		);

		expect(result.isError).toBe(true);
		expect(answer(result)).toMatchObject({
			blockerType: 'lock-write-failed',
		});
		const locks = (
			JSON.parse(readFileSync(tablePath, 'utf8')) as {
				locks: Record<string, unknown>;
			}
		).locks;
		expect(locks).toEqual({});
	});
});
