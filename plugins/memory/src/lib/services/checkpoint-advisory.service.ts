/**
 * Map checkpoint freshness onto ICheckpointAdvisory (f00156 S3).
 *
 * Reuses assessCheckpointFreshness. Never reads host transcripts.
 * Fresh → no advisory. Missing/stale → recommend create-semantic-checkpoint.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

import type { ICheckpointFreshness } from './checkpoint-freshness';

export const STALE_CHECKPOINT_CODE = 'STALE_CHECKPOINT';

export const mapFreshnessToCheckpointAdvisory = (
	freshness: ICheckpointFreshness,
): ICheckpointAdvisory | null => {
	if (freshness.state === 'fresh') return null;
	const stamp = freshness.latestCheckpointAt ?? 'none';
	return {
		triggered: true,
		code: STALE_CHECKPOINT_CODE,
		severity: 'recommend',
		message:
			'At this point, I recommend creating a semantic checkpoint before continuing.',
		reason:
			freshness.state === 'missing'
				? 'no explicit semantic checkpoint exists for this session'
				: 'the latest explicit semantic checkpoint is older than the freshness window',
		nextAction: 'create-semantic-checkpoint',
		dedupeKey: `${STALE_CHECKPOINT_CODE}:${freshness.state}:${stamp}`,
	};
};
