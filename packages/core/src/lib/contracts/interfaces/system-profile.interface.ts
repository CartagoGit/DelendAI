/**
 * q00014 S1 — the machine an agent is actually running on, and the
 * command choice that follows from it.
 *
 * Every session today re-learns the same constants by failing: run `rg`,
 * get "command not found", fall back to `grep`; run `node`, get the wrong
 * version, learn this shell needs `eval "$(fnm env)"`. `ISystemProfile`
 * is that knowledge captured once (`detectSystemProfile`), and
 * `ICommandPreference` is the pure decision derived from it
 * (`preferCommand`) — so a wrong command costs a lookup, not a turn.
 */

/** OS family, collapsed from `NodeJS.Platform` to the cases that change a command. */
export type IOsFamily = 'linux' | 'macos' | 'windows' | 'other';

/**
 * The commands the profile probes for. Deliberately small: these are the
 * ones whose presence changes which command is cheapest. POSIX baseline
 * tools (`grep`, `find`) are not probed — they are the fallback, not a
 * choice.
 */
export type IKnownCommand =
	| 'bun'
	| 'node'
	| 'npm'
	| 'pnpm'
	| 'fnm'
	| 'rg'
	| 'fd'
	| 'jq'
	| 'git';

/** Whether one probed command resolves on PATH, and where. */
export interface IToolPresence {
	readonly available: boolean;
	/** Absolute path `command -v` resolved to. Absent when unavailable. */
	readonly path?: string;
}

/**
 * Whether the requested locale actually exists on this machine.
 *
 * The `locale` command is useless as a signal here: a forwarded but
 * ungenerated `LC_ALL` (SSH/WSL both do this) makes it print a warning to
 * stderr and still exit 0. Usability is therefore decided by membership
 * in `locale -a`, not by an exit code.
 */
export interface ILocaleStatus {
	/** `LC_ALL` › `LANG`, or `'C'` when neither is set. */
	readonly requested: string;
	readonly usable: boolean;
	/** Why — quoted verbatim by callers that have to explain a warning. */
	readonly reason: string;
}

/** A machine, as far as command choice is concerned. Immutable; cached per process. */
export interface ISystemProfile {
	readonly os: IOsFamily;
	/** A Linux userland under Windows. Changes the cost of any `/mnt/<drive>` path. */
	readonly isWsl: boolean;
	readonly cpuCount: number;
	readonly totalMemoryBytes: number;
	readonly tools: Readonly<Record<IKnownCommand, IToolPresence>>;
	/**
	 * `fnm` is installed but `node` does not resolve in this shell — the
	 * caller must run `eval "$(fnm env)"` before any `node`/`npm` command.
	 */
	readonly nodeNeedsFnmEnv: boolean;
	readonly locale: ILocaleStatus;
	/**
	 * Path prefixes that cross the Windows↔Linux filesystem boundary
	 * (`/mnt/c`, …). Empty off WSL. I/O under these is roughly an order of
	 * magnitude slower than native ext4, which changes what "cheapest" means.
	 */
	readonly crossOsMountPrefixes: readonly string[];
	/** ISO timestamp of detection, so a stale profile is recognisable. */
	readonly detectedAt: string;
}

/** What a caller wants to do, not the tool it wants to use. */
export type ICommandPurpose =
	| 'search-text'
	| 'list-files'
	| 'run-tests'
	| 'typecheck'
	| 'install-deps';

/** A purpose plus whatever narrows the choice for this particular call. */
export interface ICommandPreferenceQuery {
	readonly purpose: ICommandPurpose;
	/**
	 * Absolute path the command will read or write, when known. Only used
	 * to detect a cross-OS mount; never opened.
	 */
	readonly path?: string;
}

/**
 * The command to run for one purpose on one machine, with the reasoning
 * attached so a caller can explain itself instead of looking arbitrary.
 *
 * `preferCommand` returns `null` rather than filling this in with a tool
 * the profile says is absent: a recommendation that fails is worse than
 * no recommendation.
 */
export interface ICommandPreference {
	readonly purpose: ICommandPurpose;
	/** The binary to spawn. Always one the profile confirmed, or a POSIX baseline. */
	readonly command: string;
	/** Suggested argv prefix; callers append their own operands. */
	readonly argv: readonly string[];
	readonly reason: string;
	/** False when only a fallback was available — the caller may suggest an install. */
	readonly optimal: boolean;
	/** Safe worker count for this machine and this path. Always >= 1. */
	readonly parallelism: number;
	/** Non-fatal caveats: cross-OS mount, ungenerated locale, missing `fnm env`. */
	readonly warnings: readonly string[];
}
