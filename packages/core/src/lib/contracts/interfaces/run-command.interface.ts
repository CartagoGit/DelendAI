/** Outcome of the argv-first shared command runner. */
export interface IRunArgvOutcome {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

/** Options accepted by the argv-first shared command runner. */
export interface IRunArgvOptions {
	/** Working directory. Optional — argv tools are often cwd-agnostic. */
	readonly cwd?: string;
	/** Kill the process after this many ms. Default 600000 (10 min). */
	readonly timeoutMs?: number;
	/** Cap captured bytes per stream. Default 64KiB. */
	readonly maxOutputBytes?: number;
}
