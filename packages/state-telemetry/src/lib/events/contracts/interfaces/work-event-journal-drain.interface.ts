import type { INewWorkEvent } from '../../work-event';

/** What the drain needs of the bus: somewhere to append an event. */
export interface IWorkEventSink {
	append(event: INewWorkEvent): Promise<unknown>;
}

/** What one drain did with the lines it claimed. */
export interface IWorkEventDrainResult {
	readonly appended: number;
	/** Lines that were not an event. */
	readonly skipped: number;
	/** Events the sink refused, written back to the journal for the next drain. */
	readonly retained: number;
}
