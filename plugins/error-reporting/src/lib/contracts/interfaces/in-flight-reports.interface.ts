/** Reports fired by a hook that the plugin's `dispose` waits for. */
export interface IInFlightReports {
	/** Track `report` until it settles; never rejects to the caller. */
	track(report: Promise<unknown>): void;
	/** Resolves once every report tracked so far has settled. */
	settle(): Promise<void>;
}
