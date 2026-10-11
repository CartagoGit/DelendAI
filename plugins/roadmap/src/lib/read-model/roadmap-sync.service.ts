import { EMPTY_ROADMAP } from '../contracts/constants/roadmap-store.constant';
import type { IRoadmapSyncReport } from '../contracts/interfaces/read-model.interface';
import type {
	IRoadmap,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';
import type {
	IRoadmapTimelineDraft,
	IRoadmapTimelineEvent,
	IRoadmapTimelineMeta,
} from '../contracts/interfaces/timeline.interface';
import { diffRoadmaps } from '../timeline/roadmap-diff.service';
import { replayTimeline } from '../timeline/timeline-replay.service';

/**
 * The events that would bring the timeline up to the authority file: what
 * the file says now, less what the recorded events already replay to.
 */
export const pendingTimelineDrafts = (
	roadmap: IRoadmap,
	events: readonly IRoadmapTimelineEvent[],
	meta: IRoadmapTimelineMeta,
): IRoadmapResult<readonly IRoadmapTimelineDraft[]> => {
	const replayed =
		events.length === 0
			? ({ ok: true, value: EMPTY_ROADMAP } as const)
			: replayTimeline(events);
	if (!replayed.ok) return replayed;
	return { ok: true, value: diffRoadmaps(replayed.value, roadmap, meta) };
};

/** Whether the timeline tells the same story as the file, and what it lacks. */
export const syncReport = (
	recorded: number,
	drafts: readonly IRoadmapTimelineDraft[],
): IRoadmapSyncReport => ({
	inSync: drafts.length === 0,
	recorded,
	pending: drafts.map((draft) => ({
		kind: draft.kind,
		horizon: draft.horizon,
		...(draft.entryId === undefined ? {} : { entryId: draft.entryId }),
	})),
});
