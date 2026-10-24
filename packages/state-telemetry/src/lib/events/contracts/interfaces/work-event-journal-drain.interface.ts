import type { INewWorkEvent } from '../../work-event';

/** What the drain needs of the bus: somewhere to append an event. */
export interface IWorkEventSink {
	append(event: INewWorkEvent): Promise<unknown>;
}

/** What one drain did with the lines it claimed. */
export interface IWorkEventDrainResult {
	readonly appended: number;
	readonly skipped: number;
}
