/**
 * Durable de-duplication state. One JSON document maps
 * `signature -> IReportRecord` so the same bug does not open a new
 * issue on every sighting — it is recorded once per window and future
 * sightings are suppressed until the window expires.
 */
export interface IReportRecord {
	readonly signature: string;
	/** GitHub issue number, present only when an issue was actually created. */
	readonly issueNumber?: number;
	/** Resolved issue URL, present only when an issue was created. */
	readonly issueUrl?: string;
	/** ISO timestamp of the last (attempted) report. */
	readonly lastReportedAt: string;
	/** Total sightings recorded for this signature. */
	readonly count: number;
}

export interface IReportRecordInput {
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
	readonly at: string;
}

export interface IReportStore {
	readonly statePath: string;
	get(signature: string): Promise<IReportRecord | undefined>;
	record(signature: string, input: IReportRecordInput): Promise<void>;
	all(): Promise<readonly IReportRecord[]>;
}
