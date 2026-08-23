import { describe, expect, it } from 'vitest';

import { assessCheckpointFreshness } from '../../../src/lib/services/checkpoint-freshness';
import { mapFreshnessToCheckpointAdvisory } from '../../../src/lib/services/checkpoint-advisory.service';
import type { ISessionDigestSelection } from '../../../src/lib/contracts/interfaces/session-digest-recall.interface';

const digest = (createdAt: string): ISessionDigestSelection => ({
	title: 'session-digest:work',
	topic: 'work',
	body: 'bounded',
	createdAt,
});

describe('mapFreshnessToCheckpointAdvisory', () => {
	const now = Date.parse('2026-08-23T12:00:00.000Z');

	it('emits recommend when the checkpoint is missing', () => {
		const freshness = assessCheckpointFreshness(null, now);
		const advisory = mapFreshnessToCheckpointAdvisory(freshness);
		expect(advisory?.code).toBe('STALE_CHECKPOINT');
		expect(advisory?.severity).toBe('recommend');
		expect(advisory?.nextAction).toBe('create-semantic-checkpoint');
		expect(advisory?.dedupeKey).toBe('STALE_CHECKPOINT:missing:none');
		expect(advisory?.message.startsWith('At this point, I recommend')).toBe(
			true,
		);
	});

	it('emits recommend when the checkpoint is stale', () => {
		const freshness = assessCheckpointFreshness(
			digest('2026-08-23T10:00:00.000Z'),
			now,
			30 * 60 * 1000,
		);
		const advisory = mapFreshnessToCheckpointAdvisory(freshness);
		expect(advisory?.dedupeKey).toBe(
			'STALE_CHECKPOINT:stale:2026-08-23T10:00:00.000Z',
		);
	});

	it('emits nothing when the checkpoint is fresh', () => {
		const freshness = assessCheckpointFreshness(
			digest('2026-08-23T11:50:00.000Z'),
			now,
			30 * 60 * 1000,
		);
		expect(mapFreshnessToCheckpointAdvisory(freshness)).toBeNull();
	});

	it('resets the dedupe key when a new digest is created', () => {
		const stale = mapFreshnessToCheckpointAdvisory(
			assessCheckpointFreshness(
				digest('2026-08-23T10:00:00.000Z'),
				now,
				30 * 60 * 1000,
			),
		);
		const after = mapFreshnessToCheckpointAdvisory(
			assessCheckpointFreshness(
				digest('2026-08-23T11:50:00.000Z'),
				now,
				30 * 60 * 1000,
			),
		);
		expect(stale).not.toBeNull();
		expect(after).toBeNull();
	});
});
