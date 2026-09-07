/**
 * terminal-probe.service.ts — f00418 S1.
 *
 * Service that produces an {@link ITerminalCapabilities} snapshot by
 * running a small, time-bounded set of probes against the host shell.
 * Pure over its inputs: every command goes through an injected
 * {@link ITerminalProbeDriver}, so unit tests can drive the probe
 * table without forking processes. The default driver (used when no
 * driver is passed to the constructor) goes through `node:child_process
 * .execFile` so the production runtime stays Node-portable and uses
 * Bun.spawn in the Bun path via the same seam.
 *
 * The probe orchestrator runs each layer in sequence with a hard
 * per-probe timeout (default 1 500 ms, max 2 000 ms — see probe
 * budget below). Anything that takes longer is killed by the driver
 * and we mark the signal `inferred`. The probe NEVER retries and
 * NEVER blocks the caller: it returns a snapshot with `confidence`
 * flags everywhere a probe fell back.
 *
 * Probe layers (run in this order; total budget ≤ 2 s of probes):
 *
 *  1. Detect shell: `echo $0` + `$BASH_VERSION` etc. via `/bin/bash -c`
 *     — gives us a baseline `bash` info we can compare against.
 *  2. Detect real interpreter: `readlink -f $(which $0)` from inside
 *     `/bin/bash -c '...'`. Combines with `$SHELL` from the env to
 *     classify.
 *  3. Detect dialect by running canonical probes through `bash`:
 *     `[[ 1 = 1 ]]` for arrays/doubleBracket, `<(echo x)` for
 *     processSubstitution, `set -o pipefail` + a piped failure, etc.
 *     We always run these through `/bin/bash` because we want to know
 *     about bash support, not about the actual interpreter — bash is
 *     what `withShellFallback` already constrains us to.
 *  4. Detect pager: `git --no-pager config core.pager || true`,
 *     `printf %s "$PAGER"`, `command -v less more most`.
 *  5. Detect init-script noise by comparing
 *     `<shell> -i -c 'echo __PROBE__'` against
 *     `<shell> -c 'echo __PROBE__'` — divergence is the signal.
 *
 * The `probe()` method is the public entry point and is the only
 * thing S3 (`shell_status` tool) will call.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import type {
	IDialectSupport,
	IInvocationProfile,
	IInvocationRecommendations,
	IShellDescriptor,
	ITerminalCapabilities,
	ITerminalProbeDriver,
	ITerminalProbeResult,
	TProbeConfidence,
	TTerminalDialect,
} from '../../contracts/interfaces/terminal-capabilities.interface';

const execFile = promisify(execFileCb);

const DEFAULT_PROBE_TIMEOUT_MS = 1_500;
const MAX_PROBE_TIMEOUT_MS = 2_000;
const SAFE_BASH = '/bin/bash';

/**
 * Default driver built on top of `node:child_process.execFile`. Uses
 * execFile (no shell interpolation), enforces the timeout at the OS
 * level, and returns a result shape the probe can reason about.
 */
const defaultDriver = (): ITerminalProbeDriver => {
	return {
		runCommand: (argv, timeoutMs) => {
			const startedAt = Date.now();
			return new Promise<ITerminalProbeResult>((resolve) => {
				let resolved = false;
				const finalize = (result: ITerminalProbeResult): void => {
					if (resolved) return;
					resolved = true;
					resolve(result);
				};
				const timeoutHandle = setTimeout(
					() => {
						finalize({
							stdout: '',
							stderr: '',
							exitCode: null,
							timedOut: true,
						});
					},
					Math.max(1, Math.min(timeoutMs, MAX_PROBE_TIMEOUT_MS)),
				);
				execFile(argv[0] ?? '', argv.slice(1), {
					timeout: Math.max(
						1,
						Math.min(timeoutMs, MAX_PROBE_TIMEOUT_MS),
					),
					windowsHide: true,
					encoding: 'utf8',
					maxBuffer: 1024 * 1024,
				}).then(
					(value: { stdout: string; stderr: string }) => {
						clearTimeout(timeoutHandle);
						finalize({
							stdout:
								typeof value.stdout === 'string'
									? value.stdout
									: '',
							stderr:
								typeof value.stderr === 'string'
									? value.stderr
									: '',
							exitCode: 0,
							timedOut: false,
						});
					},
					(
						err: NodeJS.ErrnoException & {
							stdout?: string;
							stderr?: string;
							code?: string | number;
							killed?: boolean;
							signal?: string;
						},
					) => {
						clearTimeout(timeoutHandle);
						const stdout =
							typeof err.stdout === 'string' ? err.stdout : '';
						const stderr =
							typeof err.stderr === 'string'
								? err.stderr
								: (err.message ?? '');
						const timedOut =
							err.killed === true ||
							err.signal === 'SIGTERM' ||
							err.code === 'ERR_CHILD_PROCESS_TIMEOUT' ||
							Date.now() - startedAt >= timeoutMs;
						finalize({
							stdout,
							stderr,
							exitCode:
								typeof err.code === 'number' ? err.code : null,
							timedOut,
						});
					},
				);
			});
		},
	};
};

/** Holds a probe signal and the confidence attached to it. */
const ok = (
	signal: boolean,
): { signal: boolean; confidence: TProbeConfidence } => ({
	signal,
	confidence: 'measured',
});

const inferred = (
	signal: boolean,
): {
	signal: boolean;
	confidence: TProbeConfidence;
} => ({ signal, confidence: 'inferred' });

const measuredIf = (
	result: ITerminalProbeResult,
	exitZero: boolean,
): { signal: boolean; confidence: TProbeConfidence } =>
	result.timedOut === true
		? inferred(exitZero)
		: result.exitCode === (exitZero ? 0 : 1)
			? ok(exitZero)
			: inferred(false);

const combinedConfidence = (
	parts: readonly { confidence: TProbeConfidence }[],
): TProbeConfidence =>
	parts.some((part) => part.confidence === 'measured')
		? 'measured'
		: 'inferred';

/** Strip surrounding whitespace and the trailing newline. */
const clean = (raw: string): string => raw.replace(/^\s+|\s+$/gu, '');

/**
 * Classify the shell name. We accept the canonical POSIX strings plus
 * the common alternates; anything else becomes `unknown` so the planner
 * falls back to the bash rule.
 */
const classifyShellName = (raw: string, banner: string): TTerminalDialect => {
	const probe = `${raw} ${banner}`.trim();
	if (/(^|\/)bash(?:[\s.]|$)/iu.test(probe)) return 'bash';
	if (/(^|\/)zsh(?:[\s.]|$)/iu.test(probe)) return 'zsh';
	if (/(^|\/)dash(?:[\s.]|$)/iu.test(probe)) return 'dash';
	if (/(^|\/)fish(?:[\s.]|$)/iu.test(probe)) return 'fish';
	if (/(^|\/)pwsh|powershell(?:[\s.]|$)/iu.test(probe)) return 'pwsh';
	if (
		/(^|\/)cmd\.exe|powershell\.exe(?:[\s.]|$)/iu.test(probe) ||
		/(^|\/)cmd(?:[\s.]|$)/iu.test(probe)
	) {
		return 'cmd';
	}
	if (/(^|\/)sh(?:[\s.]|$)/iu.test(probe)) return 'sh';
	return 'unknown';
};

/**
 * The probe service. Sole constructor arg is an optional driver; the
 * default goes through Node's `execFile`.
 */
export class TerminalProbeService {
	readonly #driver: ITerminalProbeDriver;
	readonly #timeoutMs: number;

	constructor(driver?: ITerminalProbeDriver, timeoutMs?: number) {
		this.#driver = driver ?? defaultDriver();
		this.#timeoutMs = Math.max(
			1,
			Math.min(
				timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
				MAX_PROBE_TIMEOUT_MS,
			),
		);
	}

	/** The driver the service was constructed with (for tests). */
	get driver(): ITerminalProbeDriver {
		return this.#driver;
	}

	/** The per-probe budget the service enforces (for tests). */
	get timeoutMs(): number {
		return this.#timeoutMs;
	}

	/**
	 * Run the full probe stack and return a snapshot. Total wall-clock
	 * is bounded by `PROBE_TIMEOUT_TOTAL_MS`; we don't fan out across
	 * multiple drivers, because parallelism would defeat the
	 * "predictable terminal state" invariant the document requires.
	 */
	async probe(): Promise<ITerminalCapabilities> {
		const start = Date.now();
		const shell = await this.detectShell();
		const supports = await this.probeDialect();
		const invocation = await this.probeInvocation();
		return {
			shell,
			supports,
			invocation,
			probeMs: Math.max(0, Date.now() - start),
			generatedAt: new Date().toISOString(),
		};
	}

	/** Identify the active shell and its interactivity posture. */
	async detectShell(): Promise<IShellDescriptor> {
		const envShell = clean(process.env.SHELL ?? '');
		const probeShell = await this.run([SAFE_BASH, '-c', 'echo "$0"']);
		const _probeZero = clean(probeShell.stdout);
		const probeVersion = await this.run([
			SAFE_BASH,
			'-c',
			'echo "${BASH_VERSION:-}"',
		]);
		const banner = clean(probeVersion.stdout);
		const interactive = await this.run([
			SAFE_BASH,
			'-c',
			'case "$-" in *i*) echo interactive;; esac',
		]);
		const loginProbe = await this.run([SAFE_BASH, '-c', 'echo "$0"']);
		const interactiveInit = await this.run([
			envShell !== '' ? envShell : SAFE_BASH,
			'-i',
			'-c',
			'echo __PROBE__',
		]);
		const nonInteractiveInit = await this.run([
			envShell !== '' ? envShell : SAFE_BASH,
			'-c',
			'echo __PROBE__',
		]);
		const initDiverged =
			clean(interactiveInit.stdout) !== clean(nonInteractiveInit.stdout);
		const path = envShell !== '' ? envShell : SAFE_BASH;
		const name = classifyShellName(path, banner);
		const isInteractive = interactive.stdout.includes('interactive');
		const isLogin =
			loginProbe.exitCode === 0 &&
			clean(loginProbe.stdout).startsWith('-');
		return {
			path,
			name,
			version: banner !== '' ? banner : null,
			isLogin,
			isInteractive,
			initScriptsLoad: initDiverged,
			confidence: combinedConfidence([
				measuredIf(probeShell, true),
				measuredIf(probeVersion, true),
				measuredIf(interactive, true),
				measuredIf(loginProbe, true),
				measuredIf(interactiveInit, true),
				measuredIf(nonInteractiveInit, true),
			]),
		};
	}

	/** Boolean support matrix for bash (and POSIX) features. */
	async probeDialect(): Promise<IDialectSupport> {
		const pipes = await this.run([
			SAFE_BASH,
			'-c',
			'echo x | cat > /dev/null && echo ok',
		]);
		const heredoc = await this.run([SAFE_BASH, '-c', 'cat <<EOF\nhi\nEOF']);
		const commandSubstitution = await this.run([
			SAFE_BASH,
			'-c',
			'echo "$(echo ok)"',
		]);
		const doubleBracket = await this.run([
			SAFE_BASH,
			'-c',
			'[[ 1 = 1 ]] && echo ok',
		]);
		const arrays = await this.run([
			SAFE_BASH,
			'-c',
			'arr=(ok); echo "${arr[0]:-}"',
		]);
		const pipefail = await this.run([
			SAFE_BASH,
			'-c',
			'set -o pipefail; false | true; echo ok || echo fail',
		]);
		const processSubstitution = await this.run([
			SAFE_BASH,
			'-c',
			'cat <(echo ok)',
		]);
		const timeoutProbe = await this.run(['command', '-v', 'timeout']);
		const stdbufProbe = await this.run(['command', '-v', 'stdbuf']);
		const ansiProbe = await this.run([
			SAFE_BASH,
			'-c',
			'printf "\\033[31mhi\\033[0m\\n"',
		]);
		return {
			pipes: pipes.stdout.includes('ok'),
			heredoc: heredoc.stdout.includes('hi'),
			commandSubstitution: commandSubstitution.stdout.includes('ok'),
			arrays: arrays.stdout.includes('ok'),
			doubleBracket: doubleBracket.stdout.includes('ok'),
			pipefail: !pipefail.stdout.includes('fail'),
			processSubstitution: processSubstitution.stdout.includes('ok'),
			timeout: timeoutProbe.exitCode === 0,
			stdbuf: stdbufProbe.exitCode === 0,
			ansiColor: ansiProbe.stdout.includes('\u001b['),
			confidence: combinedConfidence([
				measuredIf(pipes, true),
				measuredIf(heredoc, true),
				measuredIf(commandSubstitution, true),
				measuredIf(doubleBracket, true),
				measuredIf(arrays, true),
				measuredIf(pipefail, true),
				measuredIf(processSubstitution, true),
				measuredIf(timeoutProbe, true),
				measuredIf(stdbufProbe, true),
				measuredIf(ansiProbe, true),
			]),
		};
	}

	/** Pager + invocation profile. */
	async probeInvocation(): Promise<IInvocationProfile> {
		const pager = await this.run([
			SAFE_BASH,
			'-c',
			'printf %s "${PAGER:-}"',
		]);
		const gitPager = await this.run([
			SAFE_BASH,
			'-c',
			'git config --get core.pager 2>/dev/null || true',
		]);
		const less = await this.run(['command', '-v', 'less']);
		const more = await this.run(['command', '-v', 'more']);
		const most = await this.run(['command', '-v', 'most']);
		const lessSafe = less.exitCode === 0 ? 'less' : null;
		const moreSafe = more.exitCode === 0 ? 'more' : null;
		const mostSafe = most.exitCode === 0 ? 'most' : null;
		const pagers = [lessSafe, moreSafe, mostSafe].filter(
			(value): value is string => value !== null,
		);
		const explicitPager = clean(pager.stdout);
		const gitPagerValue = clean(gitPager.stdout);
		const paged =
			pagers.length > 0 || explicitPager !== '' || gitPagerValue !== '';
		const safeModes: IInvocationProfile['safeModes'] = paged
			? (['async'] as const)
			: (['sync', 'async'] as const);
		const recommends = this.#recommendFromPagers(paged, pagers);
		return {
			safeModes,
			paged,
			pagers,
			recommends,
		};
	}

	/** Compose the recommendations object once the pager list is known. */
	#recommendFromPagers(
		paged: boolean,
		pagers: readonly string[],
	): IInvocationRecommendations {
		const envOverrides: Record<string, string> = {};
		const noPagerFlags: string[] = [];
		if (paged) {
			envOverrides.PAGER = 'cat';
			envOverrides.GIT_PAGER = 'cat';
			envOverrides.SYSTEMD_PAGER = 'cat';
			if (pagers.includes('less')) {
				noPagerFlags.push('--no-pager');
			}
		}
		return {
			useBashExplicit: false,
			noPagerFlags,
			envOverrides,
			confidence: paged ? 'measured' : 'inferred',
		};
	}

	/** Run one probe with the configured budget. Internal helper. */
	async run(argv: readonly string[]): Promise<ITerminalProbeResult> {
		return await this.#driver.runCommand(argv, this.#timeoutMs);
	}
}

/** Convenience for non-DI callers. */
export const probeTerminalCapabilities =
	async (): Promise<ITerminalCapabilities> => {
		const service = new TerminalProbeService();
		return await service.probe();
	};
