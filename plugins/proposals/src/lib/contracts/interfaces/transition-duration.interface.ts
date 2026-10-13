/** What a document says about its own size, before any weighting. */
export interface ITransitionFeatureInputs {
	readonly slice_count: number;
	readonly affected_packages: number;
	readonly public_api_changes: number;
	readonly test_count: number;
	readonly loc_changed: number;
}

/** One stretch of work that ended in `done` or `review`. */
export interface ITransitionDurationSample {
	readonly to: string;
	readonly features: ITransitionFeatureInputs;
	readonly actorProfile: string;
	readonly taskKind: string;
	readonly durationMs: number;
	readonly createdAt: number;
}

/**
 * Where a finished transition reports how long the work took. The
 * transition tool never waits for it and never fails because of it, so
 * an implementation may be slow or unavailable without consequences.
 */
export interface IProposalDurationRecorder {
	record(sample: ITransitionDurationSample): void | Promise<void>;
}

export interface IMeasuredTransition {
	/** The document as it was before the transition rewrote it. */
	readonly previousMarkdown: string;
	readonly to: string;
	readonly agent: string | undefined;
	readonly nowMs: number;
}
