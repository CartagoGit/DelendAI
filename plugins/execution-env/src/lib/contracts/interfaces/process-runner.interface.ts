/** What a host process produced; a failure to start is an exit code, not a throw. */
export interface IProcessRunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

/** Per-run options for a host process. */
export interface IProcessRunOptions {
	readonly cwd?: string;
	/** The complete environment of the process; nothing is inherited. */
	readonly env?: Readonly<Record<string, string>>;
	readonly stdin?: string;
	readonly timeoutMs?: number;
}

/**
 * The one door through which an adapter starts a host process. Every
 * adapter takes one, so specs substitute a typed fake and never need a
 * docker daemon or an ssh server.
 *
 * `argv[0]` is the binary and the rest are its arguments. Nothing is
 * joined into a shell string, so a value from data is one argument and
 * can never become syntax.
 */
export interface IProcessRunner {
	run(
		argv: readonly string[],
		options?: IProcessRunOptions,
	): Promise<IProcessRunResult>;
}
