import type {
	IRoadmapTimelineDraft,
	IRoadmapTimelineEvent,
	IRoadmapTimelineFilter,
	IRoadmapTimelineStore,
} from '../contracts/interfaces/timeline.interface';
import type { IRoadmapResult } from '../contracts/interfaces/roadmap.interface';
import { filterTimeline } from '../timeline/timeline-query.helper';
import { sealDrafts } from '../timeline/timeline-seal.helper';

/**
 * A timeline kept in memory: the backend for tests and for callers that
 * do not need the history to outlive the process. It holds the same
 * contract as the file and database variants, so none of them is special.
 */
export class InMemoryTimelineStore implements IRoadmapTimelineStore {
	private events: readonly IRoadmapTimelineEvent[] = [];

	async append(
		drafts: readonly IRoadmapTimelineDraft[],
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		const last = this.events.at(-1)?.seq ?? 0;
		const sealed = sealDrafts(last, drafts);
		if (!sealed.ok) return sealed;
		this.events = [...this.events, ...sealed.value];
		return sealed;
	}

	async list(
		filter?: IRoadmapTimelineFilter,
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		return { ok: true, value: filterTimeline(this.events, filter) };
	}
}
