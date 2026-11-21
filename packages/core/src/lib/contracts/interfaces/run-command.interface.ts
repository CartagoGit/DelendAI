/** Outcome of the argv-first shared command runner. */
export interface IRunArgvOutcome {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
	readonly aborted?: boolean;
}

/** Options accepted by the argv-first shared command runner. */
export interface IRunArgvOptions {
	/** Working directory. Optional — argv tools are often cwd-agnostic. */
	readonly cwd?: string;
	/** Kill the process after this many ms. Default 600000 (10 min). */
	readonly timeoutMs?: number;
	/**
	 * Cap captured UTF-8 bytes across stdout+stderr combined. Default 64KiB.
	 * The shared budget is measured in real UTF-8 bytes, not UTF-16 code
	 * units. Each stream is reconstructed from raw bytes and then truncated to
	 * the largest decodable UTF-8 prefix that still fits the remaining shared
	 * budget, so incomplete trailing code points are dropped instead of
	 * surfacing U+FFFD when a valid prefix is recoverable.
	 */
	readonly maxOutputBytes?: number;
	/**
	 * Optional extra cap for stdout only. When omitted, stdout can use any
	 * remaining portion of `maxOutputBytes`. This limit is also measured in
	 * real UTF-8 bytes after stream reassembly.
	 */
	readonly maxStdoutBytes?: number;
	/**
	 * Optional extra cap for stderr only. When omitted, stderr can use any
	 * remaining portion of `maxOutputBytes`. This limit is also measured in
	 * real UTF-8 bytes after stream reassembly.
	 */
	readonly maxStderrBytes?: number;
	/**
	 * Data written to the child's stdin, then closed. When omitted, stdin
	 * is `'ignore'` (closed immediately) — the correct default for tools
	 * that never read stdin, but wrong for anything shaped like
	 * `kubectl apply -f -`, which blocks on / receives EOF from an
	 * ignored stdin and never sees the piped content.
	 */
	readonly stdin?: string;
	/**
	 * Optional abort signal. When aborted, the whole process tree is killed
	 * and the promise resolves only after the child closes.
	 */
	readonly signal?: AbortSignal;
}
