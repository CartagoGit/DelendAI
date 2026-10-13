import type { IDrainResult } from '../../../eta/contracts/interfaces/duration-journal.interface';
import type { IDurationHistoryStore } from '../../../eta/duration-history';
import type {
	IWorkEventDrainResult,
	IWorkEventSink,
} from '../../../events/contracts/interfaces/work-event-journal-drain.interface';

export interface ITelemetryDrainInput {
	/** The checkout the journals belong to (the shared one, not a worktree). */
	readonly root: string;
	readonly events: IWorkEventSink;
	readonly history: Pick<IDurationHistoryStore, 'recordDuration'>;
}

export interface ITelemetryDrainResult {
	readonly workEvents: IWorkEventDrainResult;
	readonly durations: IDrainResult;
}
