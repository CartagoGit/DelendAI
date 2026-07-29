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
	/**
	 * Data written to the child's stdin, then closed. When omitted, stdin
	 * is `'ignore'` (closed immediately) — the correct default for tools
	 * that never read stdin, but wrong for anything shaped like
	 * `kubectl apply -f -`, which blocks on / receives EOF from an
	 * ignored stdin and never sees the piped content.
	 */
	readonly stdin?: string;
}
