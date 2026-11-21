import type { IWorkEvent, TWorkEventKind } from '../../../events/work-event';
import type { WORK_PHASES } from '../constants/work-progress.constant';

export type IWorkPhase = (typeof WORK_PHASES)[number];

/** Declarative phase rule: first matching rule in the table wins. */
export interface IPhaseRule {
	readonly kind: TWorkEventKind;
	/** When set, the rule only matches if the previous event had this kind. */
	readonly afterKind?: TWorkEventKind;
	readonly phase: Exclude<IWorkPhase, 'blocked' | 'done'>;
}

/** Plain facts about one work item that the event stream cannot carry. */
export interface IWorkItemInput {
	readonly workItemId: string;
	readonly acceptanceCount: number;
	readonly acceptanceDone: number;
	readonly status: 'open' | 'in-progress' | 'review' | 'done' | 'blocked';
	/** Explicit weight; ignored unless inside the accepted range. */
	readonly weight?: number;
}

/** The left-fold accumulator of one work item; everything else derives from it. */
export interface IWorkProgressFold {
	readonly phaseRank: number;
	/** Rank each of the latest events implied, oldest first. */
	readonly recentRanks: readonly number[];
	readonly lastKind: TWorkEventKind | null;
	readonly lastFailureHash: string | null;
	readonly failureRun: number;
	readonly eventCount: number;
	readonly lastEventAt: number;
}

export interface IWorkProgressSnapshot {
	readonly workItemId: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly phase: IWorkPhase;
	/** 0..100. */
	readonly progress: number;
	readonly weight: number;
	/** Always present, in [0, 1]. */
	readonly confidence: number;
	/** Always `1 - confidence`. */
	readonly uncertainty: number;
	readonly stalled: boolean;
	readonly eventCount: number;
	readonly lastEventAt: number;
}

/** A canonical projection row: the snapshot plus the fold it derives from. */
export interface IWorkProgressRow {
	readonly snapshot: IWorkProgressSnapshot;
	readonly fold: IWorkProgressFold;
}

export interface IWorkProgressOptions {
	readonly rules?: readonly IPhaseRule[];
	readonly stalledThreshold?: number;
}

export interface IAcceptanceCompleteness {
	readonly count: number;
	readonly done: number;
}

export interface IWeightedSlice {
	readonly sliceId: string;
	readonly progress: number;
	readonly weight: number;
}

export type ISnapshotListener = (snapshot: IWorkProgressSnapshot) => void;

export interface IWorkProgressServiceOptions extends IWorkProgressOptions {
	/** Injected clock in epoch milliseconds; the service starts no timers. */
	readonly now: () => number;
	/** Minimum gap between two deliveries for one work item. */
	readonly coalesceIntervalMs?: number;
}

export interface IWorkProgressService {
	/** Replace everything with a clean rebuild. */
	load(events: readonly IWorkEvent[], items: readonly IWorkItemInput[]): void;
	/** Fold appended events in; only the touched rows change and are published. */
	append(events: readonly IWorkEvent[]): void;
	getSnapshot(workItemId: string): IWorkProgressSnapshot | undefined;
	getSnapshotsForProposal(
		proposalId: string,
	): readonly IWorkProgressSnapshot[];
	/** Returns the unsubscribe function. */
	subscribe(listener: ISnapshotListener): () => void;
	/** Deliver held snapshots whose interval has elapsed; the host calls it on its own tick. */
	flush(): void;
}
