/**
 * proposal-acceptance.ts
 *
 * Proposal Budget + Execution Plan Tool.
 *
 * Executes the `IAcceptanceCriterion[]` declared in a proposal's
 * frontmatter and returns a structured verdict that `delivery_verifier`
 * consumes to gate proposal closure.
 *
 * The implementation is intentionally thin: one subprocess per criterion,
 * captured stdout + stderr + exitCode, with a configurable per-criterion
 * timeout. The shape is documented in the
 * `the proposal-workflow knowledge` skill and locked by
 * `tests/src/lib/proposals/executable-acceptance.spec.ts`.
 *
 * Runtime: `node:child_process.spawn` with `detached: true` so each
 * criterion is its own process group. That is what lets the timeout path
 * kill the WHOLE tree (`process.kill(-pid)`), not just the leader — a
 * pipeline like `a | b` must not leave `b` running as a zombie. [M8]
 * `bun` is resolved from PATH exactly as before (we keep the `Bun.which`
 * availability pre-check); commands with shell metacharacters (`|`, `>`,
 * `&&`, …) run through the shell, the rest are tokenised with a
 * quote-aware parser so a single quoted argument keeps its spaces.
 * The working directory is injectable via `runAcceptanceCriteria`'s
 * `cwd` option instead of inheriting the server's cwd.
 *
 * Policy (the original design proposal §T3 point 10):
 *   - `exit0`  → exit code must be 0.
 *   - `pass`   → exit code must be 0 (semantic alias for `exit0`; the
 *                proposal convention uses `pass` for vitest-style
 *                commands whose meaningful output is on stdout).
 *   - `synchronized` → exit code must be 0 (alias for `exit0`; the
 *                      `the host audit tools` tools return a structured
 *                      `synchronized | drift` verdict and the criterion
 *                      is satisfied when the process exits 0, leaving
 *                      the structural check to the runtime assertion).
 *   - `contains:<substring>` → exit code must be 0 AND the captured
 *                               stdout+stderr must contain the substring.
 *
 * The function NEVER throws for a failing criterion. It throws ONLY for
 * pre-spawn validation failures (empty command, unknown `expect` literal)
 * so that the caller's batch loop is the single source of truth for
 * "all passed?" / "any failed?".
 */

import { spawn } from 'node:child_process';

import { killProcessGroup } from '@mcp-vertex/core/public';

import type { IAcceptanceCriterion } from './proposal-document';
import { ProposalParseError } from './proposal-errors';

// ---------------------------------------------------------------------------
// Public response shape
// ---------------------------------------------------------------------------

export interface IAcceptanceResult {
	readonly command: string;
	readonly expect: string;
	readonly passed: boolean;
	readonly actual: string;
	readonly exitCode: number | null;
	readonly reason?: string;
	readonly durationMs: number;
}

export interface IAcceptanceRunResult {
	readonly results: readonly IAcceptanceResult[];
	readonly allPassed: boolean;
	readonly totalDurationMs: number;
}

export interface IAcceptanceRunOptions {
	/**
	 * Working directory each criterion runs in. Inject the workspace root
	 * so commands resolve paths against it rather than the server's cwd.
	 * Omitted → inherits the current process cwd (back-compat). [M8]
	 */
	readonly cwd?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CAPTURED_BYTES = 64 * 1024; // 64 KiB per stream; truncate beyond.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs every criterion sequentially and returns a structured verdict.
 * Sequential is intentional: a flaky first criterion shouldn't race with a
 * later one, and the total runtime is dominated by the slowest single
 * criterion, not the sum.
 */
export const runAcceptanceCriteria = async (
	criteria: readonly IAcceptanceCriterion[],
	options: IAcceptanceRunOptions = {},
): Promise<IAcceptanceRunResult> => {
	const startedAt = Date.now();
	const results: IAcceptanceResult[] = [];

	for (const criterion of criteria) {
		// 1. Pre-spawn validation. We re-validate here (the parser also
		//    validates) because a caller can build an `IAcceptanceCriterion`
		//    by hand without going through `parseProposalDocument`.
		if (
			typeof criterion.command !== 'string' ||
			criterion.command.length === 0
		) {
			throw new ProposalParseError(
				'INVALID_CRITERION',
				'',
				'runAcceptanceCriteria: command must be a non-empty string',
			);
		}
		if (!isValidExpect(criterion.expect)) {
			throw new ProposalParseError(
				'INVALID_CRITERION',
				'',
				`runAcceptanceCriteria: invalid expect value "${String(
					criterion.expect,
				)}" (must be exit0 | pass | synchronized | contains:<substring>)`,
			);
		}

		// 2. Spawn the subprocess via Bun. We never mock this — the spec is
		//    an integration spec and the whole point of acceptance criteria
		//    is to verify the actual command runs in the actual environment.
		//    If Bun is unavailable in the host, every spawn throws
		//    synchronously and the per-criterion `passed: false` is returned
		//    with a clear reason. The spec at
		//    `tests/src/lib/proposals/executable-acceptance.spec.ts` adds
		//    a `skipIf(!Bun.which('bun'))` guard for that case.
		const result = await runOne(criterion, options);
		results.push(result);
	}

	const allPassed = results.every((r) => r.passed);
	return {
		results,
		allPassed,
		totalDurationMs: Date.now() - startedAt,
	};
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const isValidExpect = (
	value: unknown,
): value is IAcceptanceCriterion['expect'] => {
	if (typeof value !== 'string') return false;
	if (value === 'exit0' || value === 'pass' || value === 'synchronized') {
		return true;
	}
	return value.startsWith('contains:');
};

/**
 * Truncates a captured stream buffer to MAX_CAPTURED_BYTES. Returns the
 * original string when the buffer fits, otherwise appends a truncation
 * marker so the spec can still assert on it.
 */
const truncateCaptured = (raw: string): string => {
	if (raw.length <= MAX_CAPTURED_BYTES) return raw;
	return `${raw.slice(0, MAX_CAPTURED_BYTES)}\n...[truncated ${raw.length - MAX_CAPTURED_BYTES} bytes]`;
};

/**
 * Tokenise a command line into argv, honouring single and double quotes
 * and backslash escapes — so `echo "a b"` yields `['echo', 'a b']`, not
 * `['echo', '"a', 'b"']`. Used for the non-shell path; pipelines and
 * redirects go through the shell instead. [M8]
 */
export const tokenizeArgv = (input: string): string[] => {
	const tokens: string[] = [];
	let current = '';
	let hasToken = false;
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i] as string;
		if (quote === "'") {
			if (ch === "'") quote = null;
			else current += ch;
			continue;
		}
		if (quote === '"') {
			if (ch === '"') quote = null;
			else if (
				ch === '\\' &&
				(input[i + 1] === '"' || input[i + 1] === '\\')
			) {
				current += input[i + 1];
				i += 1;
			} else current += ch;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			hasToken = true;
		} else if (ch === '\\' && i + 1 < input.length) {
			current += input[i + 1];
			i += 1;
			hasToken = true;
		} else if (/\s/.test(ch)) {
			if (hasToken) {
				tokens.push(current);
				current = '';
				hasToken = false;
			}
		} else {
			current += ch;
			hasToken = true;
		}
	}
	if (hasToken) tokens.push(current);
	return tokens;
};

/**
 * A command needs a real shell when it carries pipes, redirects, command
 * chaining or subshells. Quotes alone do NOT need a shell — the argv
 * tokenizer handles those. [M8]
 */
export const commandNeedsShell = (command: string): boolean =>
	/[|&;<>`]|\$\(/.test(command);

/**
 * Runs a single criterion to completion (or timeout). Returns a structured
 * `IAcceptanceResult`. The function never throws for a spawn failure; it
 * returns `passed: false` with a descriptive `reason`.
 */
const runOne = async (
	criterion: IAcceptanceCriterion,
	options: IAcceptanceRunOptions,
): Promise<IAcceptanceResult> => {
	const startedAt = Date.now();
	const timeoutMs = criterion.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fail = (
		reason: string,
		exitCode: number | null = null,
	): IAcceptanceResult => ({
		command: criterion.command,
		expect: criterion.expect,
		passed: false,
		actual: '',
		exitCode,
		reason,
		durationMs: Date.now() - startedAt,
	});

	// Runtime-agnostic: the command is resolved from PATH by spawn. A
	// missing binary surfaces as a spawn 'error' (ENOENT) → structured
	// `fail`, not a crash. (M8 dropped the old hard Bun pre-check so any
	// host command — bun, npm, vitest, a shell script — can be a criterion.)
	const useShell = commandNeedsShell(criterion.command);
	const cwd = options.cwd;

	let child: ReturnType<typeof spawn>;
	try {
		if (useShell) {
			child = spawn(criterion.command, {
				...(cwd !== undefined ? { cwd } : {}),
				env: process.env,
				shell: true,
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		} else {
			const argv = tokenizeArgv(criterion.command);
			if (argv.length === 0) {
				return fail('command is empty after tokenisation');
			}
			const [cmd, ...args] = argv as [string, ...string[]];
			child = spawn(cmd, args, {
				...(cwd !== undefined ? { cwd } : {}),
				env: process.env,
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		}
	} catch (e) {
		return fail(
			`spawn failed: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	// Capture stdout + stderr, capped at MAX_CAPTURED_BYTES per stream so a
	// runaway command can't exhaust memory.
	let stdout = '';
	let stderr = '';
	const append = (existing: string, chunk: Buffer): string =>
		existing.length >= MAX_CAPTURED_BYTES
			? existing
			: existing + chunk.toString('utf8');
	child.stdout?.on('data', (d: Buffer) => {
		stdout = append(stdout, d);
	});
	child.stderr?.on('data', (d: Buffer) => {
		stderr = append(stderr, d);
	});

	// Race exit against the timeout. On timeout, kill the whole group.
	let timedOut = false;
	let spawnError: Error | null = null;
	const exitCode = await new Promise<number | null>((resolve) => {
		const timer = setTimeout(() => {
			timedOut = true;
			killProcessGroup(child.pid);
		}, timeoutMs);
		child.on('error', (err: Error) => {
			clearTimeout(timer);
			spawnError = err;
			resolve(null);
		});
		child.on('close', (code: number | null) => {
			clearTimeout(timer);
			resolve(code);
		});
	});

	if (spawnError !== null) {
		return fail(`spawn failed: ${(spawnError as Error).message}`);
	}

	const stdoutText = truncateCaptured(stdout);
	const stderrText = truncateCaptured(stderr);
	const combined = stdoutText + (stderrText ? `\n${stderrText}` : '');

	if (timedOut) {
		return {
			command: criterion.command,
			expect: criterion.expect,
			passed: false,
			actual: combined,
			exitCode: null,
			reason: `timeout: command did not exit within ${timeoutMs}ms`,
			durationMs: Date.now() - startedAt,
		};
	}

	if (criterion.expect === 'contains:') {
		// Empty substring: pass when exit 0 so the criterion stays meaningful.
		if (exitCode === 0) {
			return {
				command: criterion.command,
				expect: criterion.expect,
				passed: true,
				actual: combined,
				exitCode,
				durationMs: Date.now() - startedAt,
			};
		}
		return {
			command: criterion.command,
			expect: criterion.expect,
			passed: false,
			actual: combined,
			exitCode,
			reason: `exit code ${String(exitCode)}`,
			durationMs: Date.now() - startedAt,
		};
	}

	if (criterion.expect.startsWith('contains:')) {
		const needle = criterion.expect.slice('contains:'.length);
		if (exitCode !== 0) {
			return {
				command: criterion.command,
				expect: criterion.expect,
				passed: false,
				actual: combined,
				exitCode,
				reason: `exit code ${String(exitCode)} (substring not checked)`,
				durationMs: Date.now() - startedAt,
			};
		}
		if (!combined.includes(needle)) {
			return {
				command: criterion.command,
				expect: criterion.expect,
				passed: false,
				actual: combined,
				exitCode,
				reason: `substring not found: "${needle}"`,
				durationMs: Date.now() - startedAt,
			};
		}
		return {
			command: criterion.command,
			expect: criterion.expect,
			passed: true,
			actual: combined,
			exitCode,
			durationMs: Date.now() - startedAt,
		};
	}

	// exit0 | pass | synchronized → exit code must be 0.
	if (exitCode === 0) {
		return {
			command: criterion.command,
			expect: criterion.expect,
			passed: true,
			actual: combined,
			exitCode,
			durationMs: Date.now() - startedAt,
		};
	}
	return {
		command: criterion.command,
		expect: criterion.expect,
		passed: false,
		actual: combined,
		exitCode,
		reason: `exit code ${String(exitCode)}`,
		durationMs: Date.now() - startedAt,
	};
};
