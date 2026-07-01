import { spawn } from 'node:child_process';

import { killProcessGroup } from '../commands/process-group';
import { withFileMutex } from './with-file-mutex';

/**
 * Shared command runner for plugins that need to spawn a real process
 * (package managers, scripts, …) outside the `quality` plugin's own
 * runner. It never throws on a non-zero exit code — callers always get a
 * `{code, output, timedOut}` outcome they can surface in a tool result,
 * not an exception that would crash the tool call.
 *
 * Output is capped (`maxOutputBytes`) so a verbose command can't exhaust
 * memory, and a timeout kills the whole process group (`killProcessGroup`)
 * so no orphan survives the call. Optionally guarded by `withFileMutex`
 * around a `lockPath` (e.g. the manifest/lockfile a package-manager
 * command is about to touch) so two concurrent installs can't race each
 * other's writes.
 */
export interface IRunCommandOutcome {
	readonly code: number;
	readonly output: string;
	readonly timedOut: boolean;
}

export interface IRunCommandOptions {
	/** Working directory the command runs in. Required — never `process.cwd()`. */
	readonly cwd: string;
	/** Kill the process group after this many ms. Default 600000 (10 min). */
	readonly timeoutMs?: number;
	/** Cap captured stdout+stderr bytes. Default 64KiB. */
	readonly maxOutputBytes?: number;
	/**
	 * When set, the command runs inside `withFileMutex(lockPath, …)` — use
	 * this for any command that writes a shared file (e.g. `package.json`
	 * or a lockfile) so concurrent callers serialize instead of racing.
	 */
	readonly lockPath?: string;
}

const spawnOnce = (
	command: string,
	cwd: string,
	timeoutMs: number,
	maxOutputBytes: number,
): Promise<IRunCommandOutcome> =>
	new Promise<IRunCommandOutcome>((resolve) => {
		let output = '';
		let timedOut = false;
		const child = spawn(command, {
			cwd,
			shell: true,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const capture = (chunk: Buffer): void => {
			if (output.length < maxOutputBytes) output += chunk.toString();
		};
		child.stdout?.on('data', capture);
		child.stderr?.on('data', capture);
		const timer = setTimeout(() => {
			timedOut = true;
			killProcessGroup(child.pid);
		}, timeoutMs);
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code: timedOut ? 124 : (code ?? 1), output, timedOut });
		});
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ code: 127, output: String(error), timedOut: false });
		});
	});

/**
 * Run a shell command, never throwing on a non-zero exit (the caller reads
 * `code`/`timedOut` from the result). Async spawn — never blocks the event
 * loop. When `lockPath` is given, the spawn is serialized through
 * `withFileMutex` so concurrent writers to the same file can't race.
 */
export const runCommand = async (
	command: string,
	options: IRunCommandOptions,
): Promise<IRunCommandOutcome> => {
	const timeoutMs = options.timeoutMs ?? 600_000;
	const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;
	const run = (): Promise<IRunCommandOutcome> =>
		spawnOnce(command, options.cwd, timeoutMs, maxOutputBytes);
	return options.lockPath !== undefined
		? withFileMutex(options.lockPath, run)
		: run();
};
