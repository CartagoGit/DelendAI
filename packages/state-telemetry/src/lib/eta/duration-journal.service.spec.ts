import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryDurationHistoryStore } from './duration-history';
import { drainTransitionDurationJournal } from './duration-journal.service';

const line = (overrides: Record<string, unknown> = {}): string =>
	JSON.stringify({
		to: 'review',
		features: { slice_count: 2, affected_packages: 1 },
		actorProfile: 'agent-one',
		taskKind: 'feat:review',
		durationMs: 60_000,
		createdAt: 1_000,
		...overrides,
	});

describe('drainTransitionDurationJournal', () => {
	let dir = '';
	let journal = '';

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'duration-journal-'));
		journal = join(dir, 'transition-durations.ndjson');
	});

	afterEach(async () => rm(dir, { recursive: true, force: true }));

	it('moves every journalled stretch into the history and removes the journal', async () => {
		await writeFile(
			journal,
			`${line()}\n${line({ durationMs: 90_000 })}\n`,
			'utf8',
		);
		const store = new MemoryDurationHistoryStore();
		const result = await drainTransitionDurationJournal(store, journal);
		expect(result).toEqual({ recorded: 2, skipped: 0 });
		expect(store.list().map((row) => row.duration_ms)).toEqual([
			60_000, 90_000,
		]);
		await expect(stat(journal)).rejects.toThrow();
		await expect(stat(`${journal}.draining`)).rejects.toThrow();
	});

	it('counts unreadable lines and refused outcomes as skipped', async () => {
		await writeFile(
			journal,
			`not json\n{"to":1}\n${line({ to: 'blocked' })}\n${line()}\n`,
			'utf8',
		);
		const store = new MemoryDurationHistoryStore();
		const result = await drainTransitionDurationJournal(store, journal);
		expect(result).toEqual({ recorded: 1, skipped: 3 });
	});

	it('does nothing when there is no journal', async () => {
		const store = new MemoryDurationHistoryStore();
		expect(await drainTransitionDurationJournal(store, journal)).toEqual({
			recorded: 0,
			skipped: 0,
		});
	});

	it('leaves lines appended after the claim for the next drain', async () => {
		await writeFile(journal, `${line()}\n`, 'utf8');
		const store = new MemoryDurationHistoryStore();
		await drainTransitionDurationJournal(store, journal);
		await writeFile(journal, `${line({ durationMs: 5 })}\n`, 'utf8');
		expect(await readFile(journal, 'utf8')).toContain('"durationMs":5');
		await drainTransitionDurationJournal(store, journal);
		expect(store.count()).toBe(2);
	});
});
