import type { ITransitionDurationInput } from '@delendai/state-telemetry/public';

/**
 * Where a finished transition reports how long the work took. The
 * transition tool never waits for it and never fails because of it, so
 * an implementation may be slow or unavailable without consequences.
 */
export interface IProposalDurationRecorder {
	record(input: ITransitionDurationInput): void;
}

export interface IMeasuredTransition {
	/** The document as it was before the transition rewrote it. */
	readonly previousMarkdown: string;
	readonly to: string;
	readonly agent: string | undefined;
	readonly nowMs: number;
}
