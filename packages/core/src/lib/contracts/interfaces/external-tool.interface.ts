/**
 * external-tool.interface.ts — r00012 S1/S3: the declarative descriptor +
 * probe + runner contracts shared by every plugin that wraps an external
 * CLI (security, deps-audit, perf, forge, browser, database). Generalises
 * the ad-hoc `commandExists` (auto-agent-selector) and `discoverProviders`
 * (orchestrator-runner) probes into one seam, so adding a tool is a data
 * entry, not new control flow.
 */
import type { IRunArgvOptions, IRunArgvOutcome } from './run-command.interface';

/** One concrete "how to install this tool" command for a package manager. */
export interface IInstallHint {
	/** Package manager / channel, e.g. "brew", "npm", "cargo", "apt", "go". */
	readonly manager: string;
	/** The exact command to run, e.g. "brew install gitleaks". */
	readonly command: string;
}

/** Declarative descriptor for an external CLI a scanner/adapter wraps. */
export interface IExternalTool {
	/** Stable id, e.g. "gitleaks", "osv-scanner", "gh". */
	readonly id: string;
	/** Binary probed on PATH (often identical to `id`). */
	readonly bin: string;
	/** Argv that prints the version. Default `["--version"]`. */
	readonly versionArgs?: readonly string[];
	/**
	 * NON-global regex capturing the semantic version in group 1. A global
	 * regex carries `lastIndex` state across calls and is a bug here — keep
	 * patterns non-global.
	 */
	readonly versionPattern?: RegExp;
	/** One-command install hints; the first is surfaced as the default fix. */
	readonly installHints?: readonly IInstallHint[];
}

/** Outcome of probing a tool's presence + version. Never throws. */
export interface IToolProbeResult {
	/** The probed tool's `id`. */
	readonly tool: string;
	/** Whether the binary resolves on PATH. */
	readonly available: boolean;
	/** Parsed version, when available and parseable. */
	readonly version?: string;
	/** Best (first) install hint — present only when unavailable. */
	readonly installHint?: IInstallHint;
	/** All declared install hints (possibly empty). */
	readonly installHints: readonly IInstallHint[];
}

/**
 * Injected seam for probing — the pure `probeTool` runs over this so it is
 * unit-testable without touching the OS. `realProbeDeps()` supplies the
 * production adapter (PATH probe + version runner).
 */
export interface IProbeDeps {
	/** Resolve a binary on PATH → true/false. Must never throw. */
	readonly commandExists: (bin: string) => Promise<boolean>;
	/** Run the version argv → combined stdout+stderr (or '' on failure). */
	readonly runVersion: (
		bin: string,
		args: readonly string[],
	) => Promise<string>;
}

/**
 * The injected exec seam for `runExternalTool` — defaults to the core
 * `runArgv`, so callers are unit-testable without spawning a real process.
 */
export type IArgvExec = (
	argv: readonly string[],
	options?: IRunArgvOptions,
) => Promise<IRunArgvOutcome>;

/** Input to the shared external-tool runner. */
export interface IRunExternalToolInput {
	/** The tool descriptor (its `bin` is spawned). */
	readonly tool: IExternalTool;
	/** Literal argv appended after the binary — never shell-parsed. */
	readonly args: readonly string[];
	/** Working directory. */
	readonly cwd?: string;
	/** Kill after this many ms. Default 60000. */
	readonly timeoutMs?: number;
	/** Cap captured UTF-8 bytes across stdout+stderr combined. Default 1 MiB. */
	readonly maxOutputBytes?: number;
	/** Optional extra cap for stdout only. Defaults to no extra cap. */
	readonly maxStdoutBytes?: number;
	/** Optional extra cap for stderr only. Defaults to no extra cap. */
	readonly maxStderrBytes?: number;
	/** Literal strings / regexes replaced with `***` in captured output. */
	readonly redact?: readonly (string | RegExp)[];
	/** Data piped to the child's stdin, then closed (e.g. `kubectl apply -f -`). */
	readonly stdin?: string;
}

/** Outcome of a shared external-tool run. Never throws. */
export interface IExternalToolRun {
	/** True when the process exited 0. */
	readonly ok: boolean;
	/** Exit code (127 = binary not found, 124 = timed out). */
	readonly code: number;
	/** Redacted stdout. */
	readonly stdout: string;
	/** Redacted stderr. */
	readonly stderr: string;
	/** Whether the run hit its timeout. */
	readonly timedOut: boolean;
	/** True when the binary was not found (exit 127). */
	readonly unavailable: boolean;
}
