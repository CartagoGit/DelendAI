/**
 * terminal-capabilities.interface.ts — f00418 S1.
 *
 * The contract `TerminalProbeService` produces. The shape is the
 * canonical, host-neutral description of the terminal where an agent
 * would run a shell command — what shell, what dialect, what pager,
 * what init scripts. A tool (`shell_status` in S3) reads this contract
 * and a planner (`policy/agent-orchestrator` etc.) consumes it to
 * decide, ahead of time, whether a candidate command would block,
 * fail silently, or run cleanly.
 *
 * The contract is explicit about confidence: every probe is either
 * `measured` (the probe ran and produced a reliable signal) or
 * `inferred` (the probe failed and the field was filled by dialect
 * heuristic). Consumers MUST treat `inferred` as advisory and fall
 * back to the rule in `AGENT-BOOTSTRAP.md` §6 (bash remains the
 * default target when the probe is unavailable or failed).
 *
 * Everything in this file is pure data. The probe lives in
 * `services/shell/terminal-probe.service.ts` and is the only place
 * that calls into the actual shell via an injected driver seam.
 */

/**
 * The dialect the running shell is detected as. `unknown` is reserved
 * for the case where the probe could not classify the shell at all
 * (a binary that isn't on the candidate list). Consumers MUST NOT
 * assume bash semantics from `unknown`.
 */
export type TTerminalDialect =
	| 'bash'
	| 'zsh'
	| 'dash'
	| 'sh'
	| 'fish'
	| 'pwsh'
	| 'cmd'
	| 'unknown';

/** Confidence of a single probe result. */
export type TProbeConfidence = 'measured' | 'inferred';

/** Invocation mode the host wrapper supports. */
export type TInvocationMode = 'sync' | 'async';

/**
 * Per-shell info. `path` is the absolute path of the interpreter; `name`
 * is the canonical id (one of the {@link TTerminalDialect} values;
 * `unknown` only here is fine); `version` is the human-readable version
 * string the shell printed (`bash 5.2.21(1)-release`); `isLogin` is
 * true when the shell was invoked as a login shell; `isInteractive`
 * matches the shell's own notion of interactivity — both flags come
 * from comparing `shell -i -c ...` against `shell -c ...` as described
 * in `withShellFallback`.
 *
 * `initScriptsLoad` is the property planners want most: when true,
 * every probe run through this shell may pick up noise from `~/.zshrc`,
 * `~/.bashrc`, p10k instant prompt, or any equivalent. `TerminalProbe`
 * flips this to true whenever the interactive variant diverges from
 * the non-interactive one (a measured signal). When false, planners can
 * trust that stdout of a `shell -c` call reflects the command alone.
 */
export interface IShellDescriptor {
	readonly path: string;
	readonly name: TTerminalDialect;
	readonly version: string | null;
	readonly isLogin: boolean;
	readonly isInteractive: boolean;
	readonly initScriptsLoad: boolean;
	readonly confidence: TProbeConfidence;
}

/**
 * Booleans for each dialect feature the agent/orchestrator wants to
 * assume before invoking a command. Each maps to a specific probe:
 *
 *   - `pipes`                  — `false | true`  (POSIX `|` always)
 *   - `heredoc`                — `<<EOF` … `EOF`
 *   - `commandSubstitution`    — `$(...)` or backticks
 *   - `arrays`                 — bash `arr=(1 2 3)` (NOT POSIX sh)
 *   - `doubleBracket`          — `[[ ... ]]` (NOT POSIX sh)
 *   - `pipefail`               — `set -o pipefail`
 *   - `processSubstitution`    — `<(...)` and `>(...)`
 *   - `timeout`                — GNU `timeout(1)` in PATH
 *   - `stdbuf`                 — GNU `stdbuf(1)` in PATH
 *   - `ansiColor`              — terminal records colors in the probe
 *     output (used to decide whether to send ANSI escapes in prompts)
 */
export interface IDialectSupport {
	readonly pipes: boolean;
	readonly heredoc: boolean;
	readonly commandSubstitution: boolean;
	readonly arrays: boolean;
	readonly doubleBracket: boolean;
	readonly pipefail: boolean;
	readonly processSubstitution: boolean;
	readonly timeout: boolean;
	readonly stdbuf: boolean;
	readonly ansiColor: boolean;
	readonly confidence: TProbeConfidence;
}

/** Pager behaviour for the running terminal. */
export interface IInvocationProfile {
	readonly safeModes: readonly TInvocationMode[];
	readonly paged: boolean;
	/**
	 * The pager binaries the probe knows about — `less`, `more`,
	 * `most`. `paged: true` means at least one will fire by default.
	 */
	readonly pagers: readonly string[];
	readonly recommends: IInvocationRecommendations;
}

/**
 * Recommendations for the planner. `useBashExplicit` is true when the
 * detected shell is anything but bash AND the dialect array/`[[ ]]`
 * features are in use — i.e., the planner should pass scripts through
 * `/bin/bash -c` instead of the detected shell, per `AGENT-BOOTSTRAP.md`
 * §6.
 *
 * `noPagerFlags` is a copy-paste-ready list (`['--no-pager']` for git,
 * `['-c', 'setenv PAGER cat']` for fossil, etc.) the planner can
 * prepend to commands known to page.
 *
 * `envOverrides` are env vars to set before invoking the command
 * (`GIT_PAGER=cat`, `PAGER=cat`, `SYSTEMD_PAGER=cat`, ...). Both lists
 * are populated based on the detected pagers; an empty list is the
 * signal that nothing paged was found.
 */
export interface IInvocationRecommendations {
	readonly useBashExplicit: boolean;
	readonly noPagerFlags: readonly string[];
	readonly envOverrides: Readonly<Record<string, string>>;
	readonly confidence: TProbeConfidence;
}

/**
 * The top-level capabilities snapshot. This is the entire output of
 * `TerminalProbeService.probe()` — enough for `shell_status` (S3) and
 * any planner to compute the right invariants without re-probing.
 */
export interface ITerminalCapabilities {
	readonly shell: IShellDescriptor;
	readonly supports: IDialectSupport;
	readonly invocation: IInvocationProfile;
	/** Wall-clock probe duration in ms; useful for `shell_status`. */
	readonly probeMs: number;
	/** ISO timestamp at which the snapshot was generated. */
	readonly generatedAt: string;
}

/**
 * The injection seam. The real probe calls into the host shell through
 * this seam so tests can substitute a fake and keep the suite
 * deterministic and CI-fast. Each function runs ONE command and
 * returns `{ stdout, exitCode }` synchronously or as a Promise.
 *
 * A driver that is missing a method means "this probe category is
 * unavailable in this runtime" — the probe treats the missing method
 * as an `inferred` result rather than throwing.
 */
export interface ITerminalProbeDriver {
	/**
	 * Run a command through the host wrapper. `argv` is the full argv
	 * (no shell interpolation), and the driver is responsible for
	 * honouring `timeoutMs` itself — the probe will not enforce it.
	 */
	readonly runCommand: (
		argv: readonly string[],
		timeoutMs: number,
	) => Promise<ITerminalProbeResult> | ITerminalProbeResult;
}

/** Result shape from the driver. */
export interface ITerminalProbeResult {
	readonly stdout: string;
	readonly stderr?: string;
	readonly exitCode: number | null;
	/**
	 * Set by the driver when it had to forcibly terminate the
	 * command (timeout, runaway). The probe uses this to mark every
	 * signal extracted from the run as `inferred`.
	 */
	readonly timedOut?: boolean;
}
