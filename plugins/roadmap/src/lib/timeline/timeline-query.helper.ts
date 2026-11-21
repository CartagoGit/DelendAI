import type {
	IRoadmapTimelineEvent,
	IRoadmapTimelineFilter,
} from '../contracts/interfaces/timeline.interface';

/** Keeps the events that match every field the filter sets. */
export const filterTimeline = (
	events: readonly IRoadmapTimelineEvent[],
	filter: IRoadmapTimelineFilter = {},
): readonly IRoadmapTimelineEvent[] =>
	events.filter(
		(event) =>
			(filter.entryId === undefined ||
				event.entryId === filter.entryId) &&
			(filter.horizon === undefined || event.horizon === filter.horizon),
	);

/** The event that first put an entry on the roadmap, if the history has one. */
export const whenAdded = (
	events: readonly IRoadmapTimelineEvent[],
	entryId: string,
): IRoadmapTimelineEvent | undefined =>
	events.find(
		(event) => event.kind === 'entry-added' && event.entryId === entryId,
	);
