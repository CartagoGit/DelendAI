import { redactSecrets } from '@delendai/core/public';

import type { IRoadmapResult } from '../contracts/interfaces/roadmap.interface';
import type {
	IRoadmapTimelineDraft,
	IRoadmapTimelineEvent,
} from '../contracts/interfaces/timeline.interface';
import { timelineDraftSchema } from '../contracts/schemas/timeline.schema';

/**
 * Checks each draft and gives it the next places in the order after the
 * last event already recorded. Nothing is appended unless every draft is
 * sound, so a batch lands whole or not at all.
 */
export const sealDrafts = (
	lastSeq: number,
	drafts: readonly IRoadmapTimelineDraft[],
): IRoadmapResult<readonly IRoadmapTimelineEvent[]> => {
	const sealed: IRoadmapTimelineEvent[] = [];
	for (const [index, draft] of drafts.entries()) {
		const parsed = timelineDraftSchema.safeParse(draft);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			return {
				ok: false,
				reason: `timeline event ${index + 1} of the batch is not valid at ${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'unknown error'}`,
			};
		}
		sealed.push({
			...parsed.data,
			reason: redactSecrets(parsed.data.reason).text,
			seq: lastSeq + index + 1,
		});
	}
	return { ok: true, value: sealed };
};
