/**
 * file-lock-table-honest-reads.spec.ts — the file-lock table is read as
 * it is: never as empty while a write replaces it, never as empty when
 * it does not parse, and its unreadable bytes are kept.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeFileAtomic } from '@delendai/core/runtime';
import { runAgentLockEngine } from '@delendai/proposals/lib/locks/agent-lock-engine';
import { FileLockTableUnreadableError } from '@delendai/proposals/lib/locks/file-lock-document';
import { readFileLockEntries } from '@delendai/proposals/lib/locks/file-lock-table';

let dir = '';
let tablePath = '';
let lockPath = '';

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'honest-reads-'));
	mkdirSync(join(dir, '.cache'), { recursive: true });
	lockPath = join(dir, '.cache/agents.lock.json');
	tablePath = join(dir, '.cache/file-locks.json');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const table = (taskId: string) =>
	JSON.stringify({
		version: 2,
		locks: {
			'src/held.ts': {
				agentId: 'agent-a',
				mtime: '2026-10-24T12:00:00.000Z',
				taskId,
			},
		},
		contentionHistory: [],
	});

describe('a read while the table is being replaced', () => {
	it('sees the old table or the new one, never no claims', async () => {
		await writeFileAtomic(tablePath, table('t0'));
		let writing = true;
		const writer = (async () => {
			for (let round = 1; round <= 60; round += 1) {
				await writeFileAtomic(tablePath, table(`t${String(round)}`));
			}
			writing = false;
		})();
		const counts: number[] = [];
		while (writing) {
			counts.push((await readFileLockEntries({ tablePath })).length);
		}
		await writer;
		expect(counts.length).toBeGreaterThan(0);
		expect(counts.every((count) => count === 1)).toBe(true);
	});

	it('tries a failing read again rather than calling the table empty', async () => {
		writeFileSync(tablePath, table('t1'));
		let calls = 0;
		const entries = await readFileLockEntries({
			tablePath,
			readTable: async (path) => {
				calls += 1;
				if (calls === 1) {
					throw Object.assign(new Error('busy'), { code: 'EBUSY' });
				}
				return readFileSync(path, 'utf8');
			},
		});
		expect(entries.map((entry) => entry.taskId)).toEqual(['t1']);
	});

	it('is an error when the table keeps failing to read', async () => {
		await expect(
			readFileLockEntries({
				tablePath,
				readTable: async () => {
					throw Object.assign(new Error('denied'), {
						code: 'EACCES',
					});
				},
			}),
		).rejects.toBeInstanceOf(FileLockTableUnreadableError);
	});
});

describe('a table that does not parse', () => {
	it('is refused by a reader, which leaves its bytes where they are', async () => {
		writeFileSync(tablePath, '{"version": 2, "locks": {');
		await expect(readFileLockEntries({ tablePath })).rejects.toBeInstanceOf(
			FileLockTableUnreadableError,
		);
		expect(readFileSync(tablePath, 'utf8')).toBe(
			'{"version": 2, "locks": {',
		);
	});

	it('refuses the claim, keeps its bytes aside, and the next claim starts clean', async () => {
		const broken = '{"version": 2, "locks": {"src/held.ts":';
		writeFileSync(tablePath, broken);

		const refused = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-1',
				agent: 'agent-a',
				files: ['src/one.ts'],
			},
			{ lockPath },
		);

		expect(refused.isError).toBe(true);
		expect(refused.content[0]?.text).toContain('lock-table-unreadable');
		const aside = readdirSync(join(dir, '.cache')).filter((name) =>
			name.startsWith('file-locks.json.corrupt-'),
		);
		expect(aside).toHaveLength(1);
		expect(readFileSync(join(dir, '.cache', aside[0] ?? ''), 'utf8')).toBe(
			broken,
		);
		expect(existsSync(tablePath)).toBe(false);

		const next = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-1',
				agent: 'agent-a',
				files: ['src/one.ts'],
			},
			{ lockPath },
		);
		expect(next.isError).not.toBe(true);
	});
});
