/** One check run on a candidate's head, as the forge lists it. */
export interface IArmingCheckRun {
	readonly name: string;
	readonly status?: string | null;
	readonly conclusion: string | null;
}

/** Whether a candidate's required checks let it be armed, and why not. */
export interface IRequiredChecksVerdict {
	readonly passed: boolean;
	readonly missing: readonly string[];
	readonly pending: readonly string[];
	readonly failed: readonly string[];
}
