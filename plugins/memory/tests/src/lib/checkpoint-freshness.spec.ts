import { describe, expect, it } from 'vitest';

import { assessCheckpointFreshness } from '@mcp-vertex/memory/lib/services/checkpoint-freshness';

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
});
