import type { EXECUTION_CAPABILITIES } from '../constants/execution-capability.constant';

/** One thing an environment can promise; see `EXECUTION_CAPABILITIES`. */
export type IExecutionCapability = (typeof EXECUTION_CAPABILITIES)[number];

/** What a caller learns from running one command. */
export interface IExecResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	/** True when nothing ran because the call was a dry run. */
	readonly dryRun: boolean;
	/**
	 * The argument vector that was, or in a dry run would have been,
	 * handed to the host binary. Never a shell string.
	 */
	readonly plannedArgv: readonly string[];
	readonly durationMs: number;
}

/** Per-call options for `exec`. */
export interface IExecOptions {
	/** Directory the command starts in, inside the environment. */
	readonly cwd?: string;
	/** Extra variables for this command only. */
	readonly env?: Readonly<Record<string, string>>;
	/** Milliseconds before the command is abandoned. */
	readonly timeoutMs?: number;
	/** Text written to the command's standard input. */
	readonly stdin?: string;
}

/** What `prepare` reports once the environment is ready. */
export interface IPrepareResult {
	readonly ok: boolean;
	/** Why it is not ready; only present when `ok` is false. */
	readonly reason?: string;
	readonly durationMs: number;
	/** True when nothing was started because the call was a dry run. */
	readonly dryRun?: boolean;
	/** The host commands that were, or in a dry run would have been, run. */
	readonly plannedArgv?: readonly (readonly string[])[];
}

/** What `teardown` reports once the environment is released. */
export interface ITeardownResult {
	readonly ok: boolean;
	readonly reason?: string;
	readonly durationMs: number;
	readonly dryRun?: boolean;
	readonly plannedArgv?: readonly (readonly string[])[];
}

/** The environment as a caller sees it: variables, redacted. */
export type IExecutionEnvVariables = Readonly<Record<string, string>>;
