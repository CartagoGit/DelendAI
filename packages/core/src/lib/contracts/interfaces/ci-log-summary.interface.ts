/** One failing test, reduced to what a decision needs. */
export interface ICiLogFailure {
	/** The test's full name as the runner printed it. */
	readonly test: string;
	/** The first assertion or error line printed for it, when there is one. */
	readonly reason?: string | undefined;
}

/**
 * A CI job log or a test run, as structure instead of transcript: which
 * job, which step failed, the tally, and the failing tests with the one
 * line that says why. Everything else in a log is how it got there.
 */
export interface ICiLogSummary {
	readonly runner: 'vitest' | 'bun' | 'unknown';
	readonly job?: string | undefined;
	/** The last step that started before the job failed. */
	readonly failedStep?: string | undefined;
	readonly tally?:
		| {
				readonly passed: number;
				readonly failed: number;
				readonly skipped: number;
		  }
		| undefined;
	readonly failures: readonly ICiLogFailure[];
	/** `##[error]` annotations, in order. */
	readonly errors: readonly string[];
	readonly linesRead: number;
}
