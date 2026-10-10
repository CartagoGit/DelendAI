import type { IWorkEvent } from '../../../events/work-event';
import type {
	IWorkPhase,
	IWorkProgressSnapshot,
} from '../../../projector/contracts/interfaces/work-progress.interface';

/** One open proposal as the status view reads it: its id and its document. */
export interface IWorkStatusProposal {
	readonly id: string;
	readonly title: string;
	readonly markdown: string;
}

/** One proposal's line in the status view. */
export interface IWorkStatusRow {
	readonly proposalId: string;
	readonly title: string;
	/** Weighted progress of its slices, from 0 to 100. */
	readonly progress: number;
	/** The furthest-behind phase among the slices still moving. */
	readonly phase: IWorkPhase;
	readonly slices: number;
	readonly stalled: number;
	/** The last event on any of its slices, epoch milliseconds; 0 when none. */
	readonly lastEventAt: number;
	readonly snapshots: readonly IWorkProgressSnapshot[];
}

/** What the view is computed from. */
export interface IWorkStatusInput {
	readonly proposals: readonly IWorkStatusProposal[];
	readonly events: readonly IWorkEvent[];
	readonly now: number;
}

/** One agent the events show at work. */
export interface IWorkAgentRow {
	readonly agentId: string;
	readonly workItemId: string;
	readonly lastKind: string;
	readonly lastEventAt: number;
}
