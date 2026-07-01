/**
 * release-logger.ts — Solid SRP/OCP extraction.
 *
 * The release script used to pass `quiet: boolean` to every helper, so
 * each call site did `if (quiet) return; console.log(...)`. That mixed
 * two responsibilities:
 *
 *   1. The **decision** of whether a message should appear (the
 *      `--quiet` flag, currently).
 *   2. The **action** of emitting it to a sink (the terminal, today;
 *      a CI log, tomorrow).
 *
 * With `IReleaseLogger`:
 *
 *   - The two responsibilities are **decoupled** (SRP).
 *   - New sinks (JSON for CI, file for a permanent audit log, an in-
 *     memory buffer for tests) are added by **new implementations**
 *     without touching the script (OCP).
 *   - Every helper depends only on the interface (DIP).
 *   - Tests can spy on the logger instead of monkey-patching
 *     `console.log` (ISP-friendly — narrow surface).
 */

/**
 * Three channels, three semantics. `info` is the noisy progress banner
 * suppressed by `--quiet`; `warn` and `error` always go through.
 * Splitting them lets a CI sink route them to different streams
 * (stdout / stderr) without the script caring.
 */
export interface IReleaseLogger {
	/** Progress / banner output. Suppressed when `--quiet` is set. */
	info(...args: readonly unknown[]): void;
	/** Recoverable issues (e.g. `--provenance` ignored under bun). */
	warn(...args: readonly unknown[]): void;
	/** Fatal errors. Always emitted, even under `--quiet`. */
	error(...args: readonly unknown[]): void;
}

/**
 * Production logger: routes `info` to stdout, `warn`/`error` to
 * stderr. Mirrors what every CLI should do but the script used to
 * violate (all three were `console.log`).
 */
export const createConsoleLogger = (): IReleaseLogger => ({
	info: (...args) => console.log(...args),
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
});

/**
 * `--quiet` logger: drops `info` entirely, keeps `warn`/`error` so
 * genuine problems still surface in CI. Distinct from `NullLogger`
 * (which silences everything) because a misbehaving release that
 * silently fails a publish is worse than one that prints progress.
 */
export const createQuietLogger = (): IReleaseLogger => ({
	info: () => {},
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
});

/**
 * Test logger: captures every channel in order, no side effects.
 * Each spec instantiates one and asserts on `log.calls`.
 */
export interface IRecordingLogger extends IReleaseLogger {
	readonly calls: readonly (readonly unknown[])[];
}

export const createRecordingLogger = (): IRecordingLogger => {
	const calls: unknown[][] = [];
	return {
		info: (...args) => {
			calls.push(['info', ...args]);
		},
		warn: (...args) => {
			calls.push(['warn', ...args]);
		},
		error: (...args) => {
			calls.push(['error', ...args]);
		},
		get calls() {
			return calls;
		},
	};
};
