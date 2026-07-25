/**
 * file-lock-table.spec.ts — a00072 S8.a acceptance.
 *
 * The file-lock table is the durable `file → holder` map at
 * `.cache/mcp-vertex/file-locks.json`. Tests cover the four
 * operations exposed by the module: `readFileLockTable`,
 * `writeFileLockTable`, `tryAcquireFileLocks`, `releaseFileLocks`,
 * plus `listLocks` for the contention detector.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	deriveFileLockTablePath,
	listLocks,
	readFileLockTable,
	releaseFileLocks,
	tryAcquireFileLocks,
	writeFileLockTable,
} from '../../../../src/lib/locks/file-lock-table';

describe('file-lock-table (a00072 S8.a)', () => {
	let root = '';
	let tablePath = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'file-lock-table-'));
		tablePath = join(root, 'file-locks.json');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns an empty table when the file is missing', async () => {
		const table = await readFileLockTable({ tablePath });
		expect(table).toEqual({});
	});

	it('persists a table under withFileMutex atomic write', async () => {
		await writeFileLockTable(
			{ 'src/a.ts': { agentId: 'a', mtime: '2026-07-25T00:00:00.000Z' } },
			{ tablePath },
		);
		const table = await readFileLockTable({ tablePath });
		expect(table['src/a.ts']?.agentId).toBe('a');
	});

	it('tryAcquireFileLocks succeeds for an empty file slot', async () => {
		const result = await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts', 'src/b.ts'],
			tablePath,
		});
		expect(result.ok).toBe(true);
		const table = await readFileLockTable({ tablePath });
		expect(Object.keys(table).sort()).toEqual(['src/a.ts', 'src/b.ts']);
	});

	it('tryAcquireFileLocks refuses when another agent holds the file', async () => {
		await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts'],
			tablePath,
		});
		const result = await tryAcquireFileLocks({
			agentId: 'agent-2',
			files: ['src/a.ts', 'src/b.ts'],
			tablePath,
		});
		expect(result.ok).toBe(false);
		// The conflict must be reported — `agent-2` may still acquire
		// `src/b.ts` after the caller observes the conflict.
		if (!result.ok) {
			expect(result.conflictOn).toBe('src/a.ts');
			expect(result.heldBy).toBe('agent-1');
		}
	});

	it('tryAcquireFileLocks is idempotent for the same agent', async () => {
		await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts'],
			tablePath,
		});
		const result = await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts'],
			tablePath,
		});
		expect(result.ok).toBe(true);
	});

	it('releaseFileLocks removes only the named files for the given agent', async () => {
		await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts', 'src/b.ts'],
			tablePath,
		});
		await tryAcquireFileLocks({
			agentId: 'agent-2',
			files: ['src/c.ts'],
			tablePath,
		});
		await releaseFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts'],
			tablePath,
		});
		const table = await readFileLockTable({ tablePath });
		expect(Object.keys(table).sort()).toEqual(['src/b.ts', 'src/c.ts']);
	});

	it('listLocks returns the current table', async () => {
		await tryAcquireFileLocks({
			agentId: 'agent-1',
			files: ['src/a.ts'],
			tablePath,
		});
		const listed = await listLocks({ tablePath });
		expect(listed['src/a.ts']?.agentId).toBe('agent-1');
	});

	it('deriveFileLockTablePath defaults next to the lock file', () => {
		const derived = deriveFileLockTablePath(
			'/abs/.cache/mcp-vertex/agents.lock.json',
		);
		expect(derived).toBe('/abs/.cache/mcp-vertex/file-locks.json');
	});

	it('create the parent directory on first write (mtime recorded)', async () => {
		const nested = join(root, 'nested', 'subdir', 'file-locks.json');
		await writeFileLockTable({}, { tablePath: nested });
		const table = await readFileLockTable({ tablePath: nested });
		expect(table).toEqual({});
	});
});
