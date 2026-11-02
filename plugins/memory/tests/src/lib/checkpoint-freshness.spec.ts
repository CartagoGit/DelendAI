import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
	assessCheckpointFreshness,
	refreshCheckpointFreshnessAdvisory,
} from '@delendai/memory/lib/services/checkpoint-freshness';
import { saveNote } from '@delendai/memory/lib/services/store';

const digest = (createdAt: string) => ({
	title: 'session-digest:test',
	topic: 'test',
	body: '# Session digest',
	createdAt,
});

describe('checkpoint freshness', () => {
	it('reports a missing explicit checkpoint', () => {
		expect(
			assessCheckpointFreshness(
				null,
				Date.parse('2026-07-24T12:00:00.000Z'),
			),
		).toEqual({
			state: 'missing',
			latestCheckpointAt: null,
			ageMs: null,
			maxAgeMs: 1_800_000,
		});
	});

	it('reports a recent checkpoint as fresh', () => {
		expect(
			assessCheckpointFreshness(
				digest('2026-07-24T11:45:00.000Z'),
				Date.parse('2026-07-24T12:00:00.000Z'),
			),
		).toMatchObject({ state: 'fresh', ageMs: 900_000 });
	});

	it('is conservative for old or malformed timestamps', () => {
		expect(
			assessCheckpointFreshness(
				digest('2026-07-24T11:00:00.000Z'),
				Date.parse('2026-07-24T12:00:00.000Z'),
			),
		).toMatchObject({ state: 'stale', ageMs: 3_600_000 });
		expect(
			assessCheckpointFreshness(digest('not-a-date'), Date.now()),
		).toMatchObject({ state: 'stale', ageMs: null });
	});

	it('refreshes advisory and mtime from the current durable store snapshot', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'mem-freshness-'));
		const store = join(dir, 'notes.json');
		try {
			await saveNote(
				store,
				{
					title: 'session-digest:work',
					body: 'bounded',
					tags: ['session-digest'],
				},
				() => '2026-08-23T11:55:00.000Z',
			);
			const refreshed = await refreshCheckpointFreshnessAdvisory(store, {
				nowMs: Date.parse('2026-08-23T12:00:00.000Z'),
				maxAgeMs: 30 * 60 * 1000,
			});
			expect(refreshed.freshness.state).toBe('fresh');
			expect(refreshed.advisory).toBeNull();
			expect(typeof refreshed.mtimeMs).toBe('number');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
