/**
 * diagnose-log.interface.ts — the options the log-diagnosis tool
 * registration takes.
 */

export type IDiagnoseLogIssueOutcome = {
	readonly attempted: boolean;
	readonly submitted: boolean;
	readonly shapeId: string;
	readonly title?: string;
	readonly refusedBecause?: string;
};
