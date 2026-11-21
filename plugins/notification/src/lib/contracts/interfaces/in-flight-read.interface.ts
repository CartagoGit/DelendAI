/** A claim that was released (present last scan, gone this scan). */
export interface IReleasedClaim {
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
}

/** The in-flight claims, and why the lock file could not be read, if it could not. */
export interface IInFlightRead {
	readonly claims: Map<string, IReleasedClaim>;
	/** Set when the file exists but cannot be read or parsed: nothing is known, not "nothing is held". */
	readonly readError?: string | undefined;
}
