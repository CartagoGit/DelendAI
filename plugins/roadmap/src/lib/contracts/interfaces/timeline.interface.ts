import type { TIMELINE_EVENT_KINDS } from '../constants/timeline.constant';
import type { IRoadmapFilePort } from './roadmap-store.interface';
import type {
	IRoadmapBumpHint,
	IRoadmapEntry,
	IRoadmapEntryState,
	IRoadmapResult,
} from './roadmap.interface';

export type IRoadmapTimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

/** Who did it, when, and why: the part of an event the diff cannot show. */
export interface IRoadmapTimelineMeta {
	readonly actor: string;
	/** ISO timestamp, supplied by the caller so the timeline owns no clock. */
	readonly at: string;
	readonly reason: string;
}

/** An event before the timeline gives it its place in the order. */
export interface IRoadmapTimelineDraft extends IRoadmapTimelineMeta {
	readonly kind: IRoadmapTimelineEventKind;
	readonly horizon: string;
	readonly entryId?: string | undefined;
	/** The whole entry, for `entry-added` and `entry-edited`. */
	readonly entry?: IRoadmapEntry | undefined;
	/** `entry-state-changed` only. */
	readonly from?: IRoadmapEntryState | undefined;
	readonly to?: IRoadmapEntryState | undefined;
	/** `horizon-added` and `horizon-hint-set`; absent clears the hint. */
	readonly bumpHint?: IRoadmapBumpHint | undefined;
}

export interface IRoadmapTimelineEvent extends IRoadmapTimelineDraft {
	/** Position in the order, assigned on append and never reused. */
	readonly seq: number;
}

export interface IRoadmapTimelineFilter {
	readonly entryId?: string | undefined;
	readonly horizon?: string | undefined;
}

/**
 * Where the history lives. The only way to change it is to append: there
 * is no operation that removes or rewrites an event, so a backend cannot
 * be asked to.
 */
export interface IRoadmapTimelineStore {
	readonly append: (
		drafts: readonly IRoadmapTimelineDraft[],
	) => Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>>;
	readonly list: (
		filter?: IRoadmapTimelineFilter,
	) => Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>>;
}

export interface IMarkdownTimelineStoreOptions {
	/** Absolute path of the timeline file, supplied by the caller. */
	readonly path: string;
	readonly files: IRoadmapFilePort;
}
