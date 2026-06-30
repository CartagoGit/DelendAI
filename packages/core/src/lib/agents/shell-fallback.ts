/**
 * shell-fallback.ts — f00085.
 *
 * A self-healing ladder for agent shell invocations. The motivating
 * failure mode: the VS Code Chat `run_in_terminal { mode: "sync" }`
 * wrapper sometimes claims the sub-shell opened an alternate buffer
 * (VT100 `ESC[?1049h`) and aborts with no output, no exit code, and no
 * recovery path. The human can still open a fresh shell; the agent
 * cannot, because it talks to the wrapper, not the shell.
 *
 * This module is the ONE source of truth for that recovery. It is a
 * pure, dependency-free library so every plugin and every agent in the
 * swarm can `import { withShellFallback } from '@mcp-vertex/core/public'`
 * and drive the ladder without re-encoding the sentinel strings.
 *
 * Architecture — three concentric rings, applied in order, cheapest
 * first (see the f00085 proposal "architecture" section):
 *
 *   - Ring 1 (detect): {@link detectStuckShell} matches the wrapper's
 *     stuck-state sentinels. When it fires, the same `mode: "sync"`
 *     call MUST NOT be retried — the wrapper state is sticky.
 *   - Ring 2 (async): re-issue as `mode: "async"` and poll. The
 *     wrapper hands back a UUID as soon as the command is idle,
 *     regardless of TTY state, so `async` always works.
 *   - Ring 3 (file tools): substitute file/MCP tools for shell tools
 *     when no terminal is available at all. The adapter
 *     ({@link mapShellIntentToTool}) maps a `command + args` intent to
 *     the right non-shell tool, so plan code keeps its `git mv`-shaped
 *     calls instead of branching on the ladder everywhere.
 *
 * Pure over its inputs: no I/O, no global state, no `process.cwd()`.
 * The actual `run_in_terminal` / `read_file` calls are injected by the
 * caller as the {@link IShellFallbackDriver} seam, so this module stays
 * runtime-agnostic and trivially testable.
 */

/* ------------------------------------------------------------------ *
 *  Ring 1 — stuck-state detection
 * ------------------------------------------------------------------ */

/**
 * Known wrapper stuck-state sentinels. Each is a substring (locale
 * variant) the `run_in_terminal` wrapper emits when the sub-shell
 * opened an alternate buffer and the wrapper gave up. Matching is
 * case-insensitive and substring-based because the wrapper wraps the
 * sentinel in surrounding prose that varies by version.
 *
 * Open/Closed: a new locale variant is one more entry here; nothing
 * else changes.
 */
export const STUCK_SHELL_SENTINELS: readonly string[] = [
	// Spanish locale (the 2026-06-28 f00077 case).
	'el comando abrió el búfer alternativo',
	// Spanish locale without the accent (some terminals strip it).
	'el comando abrio el bufer alternativo',
	// English locale variants.
	'opened the alternate buffer',
	'open alternative buffer',
	'opened an alternate screen buffer',
];

/** A `run_in_terminal`-shaped result the detector inspects. */
export interface IShellResult {
	/** Combined stdout/stderr the wrapper returned, if any. */
	readonly output?: string | null;
	/** Process exit code, if the wrapper produced one. */
	readonly exitCode?: number | null;
	/** Terminal UUID, present only for `mode: "async"` calls. */
	readonly terminalId?: string | null;
}

/**
 * True when `result` matches the wrapper's stuck-state pattern: a
 * sentinel string AND no recoverable signal (no exit code, no terminal
 * id). A command that merely failed (non-zero exit with real output)
 * is NOT stuck — the ladder must not fire on intentional failures.
 *
 * Defensive over its input: a missing/non-string output is treated as
 * "no sentinel" rather than throwing.
 */
export const detectStuckShell = (
	result: IShellResult | null | undefined,
): boolean => {
	if (!result) return false;
	// A real result with an exit code or a terminal id is recoverable;
	// the stuck state is defined by the absence of both plus a sentinel.
	if (typeof result.exitCode === 'number') return false;
	if (typeof result.terminalId === 'string' && result.terminalId !== '') {
		return false;
	}
	const output = result.output;
	if (typeof output !== 'string' || output === '') return false;
	const haystack = output.toLowerCase();
	return STUCK_SHELL_SENTINELS.some((sentinel) =>
		haystack.includes(sentinel),
	);
};

/* ------------------------------------------------------------------ *
 *  Ring 3 — file-tool adapter (intent → non-shell tool)
 *
 *  Implemented in S3. Re-exported here so the public surface is stable
 *  from S1 onward.
 * ------------------------------------------------------------------ */

export {
	mapShellIntentToTool,
	SHELL_INTENT_MAP,
} from './shell-fallback-intent-map';
export type {
	IShellIntent,
	IShellToolPlan,
} from './shell-fallback-intent-map';

/* ------------------------------------------------------------------ *
 *  The ladder
 * ------------------------------------------------------------------ */

/** Which ring resolved (or failed) the invocation. */
export type ShellFallbackRing = 'sync' | 'async' | 'file-tools' | 'failed';

/** Outcome of {@link withShellFallback}. */
export interface IShellFallbackOutcome {
	/** The ring that produced the final result. */
	readonly ring: ShellFallbackRing;
	/** The terminal result, when a shell ring (sync/async) resolved. */
	readonly result?: IShellResult;
	/**
	 * Human-readable trail of what the ladder tried, in order. Useful
	 * for surfacing a compact "auto-recovered via async" note rather
	 * than the raw wrapper error.
	 */
	readonly trail: readonly string[];
}

/**
 * The host-supplied seam the ladder drives. Each method is optional:
 * an agent runtime with no terminal at all supplies only the file
 * tools, and the ladder skips straight to Ring 3.
 */
export interface IShellFallbackDriver {
	/** Run a command synchronously (Ring 1, the fast path). */
	readonly runSync?: (
		command: string,
	) => Promise<IShellResult> | IShellResult;
	/** Run a command in async mode, returning a terminal id (Ring 2). */
	readonly runAsync?: (
		command: string,
	) => Promise<IShellResult> | IShellResult;
	/**
	 * Poll an async terminal for its accumulated output (Ring 2). The
	 * ladder calls this once after `runAsync`; the agent drives any
	 * further polling itself.
	 */
	readonly pollAsync?: (
		terminalId: string,
	) => Promise<IShellResult> | IShellResult;
}

/**
 * Drive the shell-fallback ladder for a single command.
 *
 * 1. Try `runSync`. If the result is not stuck, return it (Ring 1).
 * 2. On a stuck sentinel (or when `runSync` is unavailable), escalate
 *    to `runAsync` + one `pollAsync` (Ring 2).
 * 3. If neither shell ring is available, return a `file-tools` outcome
 *    so the caller knows to use {@link mapShellIntentToTool}.
 *
 * The ladder NEVER retries a stuck `sync` call — the wrapper state is
 * sticky and the retry would also fail.
 */
export const withShellFallback = async (
	command: string,
	driver: IShellFallbackDriver,
): Promise<IShellFallbackOutcome> => {
	const trail: string[] = [];

	// Ring 1 — sync fast path.
	if (driver.runSync) {
		const syncResult = await driver.runSync(command);
		if (!detectStuckShell(syncResult)) {
			trail.push('sync: ok');
			return { ring: 'sync', result: syncResult, trail };
		}
		trail.push('sync: stuck sentinel — escalating to async');
	} else {
		trail.push('sync: unavailable — escalating to async');
	}

	// Ring 2 — async re-issue + one poll.
	if (driver.runAsync) {
		const asyncResult = await driver.runAsync(command);
		const terminalId = asyncResult.terminalId;
		if (
			typeof terminalId === 'string' &&
			terminalId !== '' &&
			driver.pollAsync
		) {
			const polled = await driver.pollAsync(terminalId);
			trail.push('async: ok (polled)');
			return { ring: 'async', result: polled, trail };
		}
		if (!detectStuckShell(asyncResult)) {
			trail.push('async: ok');
			return { ring: 'async', result: asyncResult, trail };
		}
		trail.push('async: still stuck — escalating to file tools');
	} else {
		trail.push('async: unavailable — escalating to file tools');
	}

	// Ring 3 — no shell available; caller substitutes file tools.
	trail.push('file-tools: use mapShellIntentToTool for this command');
	return { ring: 'file-tools', trail };
};
