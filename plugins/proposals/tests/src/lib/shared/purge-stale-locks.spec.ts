import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { purgeStaleLocks } from '@delendai/proposals/lib/shared/purge-stale-locks';

describe('purgeStaleLocks', () => {
	let root = '';
	let lockPath = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'purge-stale-locks-'));
		lockPath = join(root, 'agents.lock.json');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns stale task ids without mutating the lock file', async () => {
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 'f00126-S3',
						agent: 'impl-runner-a',
						ownership: ['a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
					{
						task_id: 'f00126-S4',
						agent: 'impl-runner-b',
						ownership: ['b.ts'],
						started_at: '2999-01-01T00:00:00.000Z',
						last_seen: '2999-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const before = readFileSync(lockPath, 'utf8');
		const result = await purgeStaleLocks({ lockPath });
		const after = readFileSync(lockPath, 'utf8');

		expect(result).toEqual({
			purged: 1,
			taskIds: ['f00126-S3'],
			lastStaleSeen: '2000-01-01T00:00:00.000Z',
		});
		expect(after).toBe(before);
	});

	it('respects an explicit staleAfterMinutes override', async () => {
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 9999,
				in_flight: [
					{
						task_id: 'f00127-S2',
						agent: 'impl-runner-c',
						ownership: ['c.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			}),
		);

		const result = await purgeStaleLocks({
			lockPath,
			staleAfterMinutes: 10,
		});

		expect(result.purged).toBe(1);
		expect(result.taskIds).toEqual(['f00127-S2']);
	});
});
