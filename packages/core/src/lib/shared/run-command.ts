import { spawn } from 'node:child_process';

import { killProcessGroup, killProcessTree } from '../commands/process-group';
import type {
	IRunArgvOptions,
	IRunArgvOutcome,
} from '../contracts/interfaces/run-command.interface';
import { truncateUtf8Buffer } from './truncate-utf8';
import { withFileMutex } from './with-file-mutex';

export type {
	IRunArgvOptions,
	IRunArgvOutcome,
} from '../contracts/interfaces/run-command.interface';

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

/**
 * x00097 S5 (audit a00052 #16): shell commands run through an EXPLICIT
 * `bash --noprofile --norc -c` instead of `shell: true`. The implicit
 * shell is `/bin/sh` — dash on Debian/Ubuntu/WSL, ash on Alpine — so the
 * same command string parsed differently per host; bash is the one shell
 * dialect this repo standardizes on (AGENT-BOOTSTRAP §6). Windows keeps
 * `shell: true` (no bash contract there).
 */
const spawnShell = (command: string, cwd: string): ReturnType<typeof spawn> =>
	process.platform === 'win32'
		? spawn(command, {
				cwd,
				shell: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		: spawn('/bin/bash', ['--noprofile', '--norc', '-c', command], {
				cwd,
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

interface IByteCollector {
	readonly chunks: Buffer[];
	collectedBytes: number;
	readonly limitBytes?: number;
}

const createByteCollector = (limitBytes?: number): IByteCollector => ({
	chunks: [],
	collectedBytes: 0,
	...(limitBytes !== undefined ? { limitBytes } : {}),
});

const remainingBytes = (collector: IByteCollector): number =>
	collector.limitBytes === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(0, collector.limitBytes - collector.collectedBytes);

const captureUtf8Bytes = (
	collector: IByteCollector,
	chunk: Buffer,
	sharedCollector?: IByteCollector,
): void => {
	const chunkBytes = Buffer.byteLength(chunk);
	const bytesToTake = Math.min(
		chunkBytes,
		remainingBytes(collector),
		sharedCollector === undefined
			? Number.POSITIVE_INFINITY
			: remainingBytes(sharedCollector),
	);
	if (bytesToTake <= 0) return;
	collector.chunks.push(chunk.subarray(0, bytesToTake));
	collector.collectedBytes += bytesToTake;
	if (sharedCollector !== undefined) {
		sharedCollector.collectedBytes += bytesToTake;
	}
};

const decodeUtf8Chunks = (chunks: readonly Buffer[]): string =>
	truncateUtf8Buffer(Buffer.concat(chunks), Buffer.concat(chunks).length).toString(
		'utf8',
	);

const spawnOnce = (
	command: string,
	cwd: string,
	timeoutMs: number,
	maxOutputBytes: number,
): Promise<IRunCommandOutcome> =>
	new Promise<IRunCommandOutcome>((resolve) => {
		const outputCollector = createByteCollector(maxOutputBytes);
		let timedOut = false;
		const child = spawnShell(command, cwd);
		const capture = (chunk: Buffer): void => {
			captureUtf8Bytes(outputCollector, chunk);
		};
		child.stdout?.on('data', capture);
		child.stderr?.on('data', capture);
		const timer = setTimeout(() => {
			timedOut = true;
			killProcessGroup(child.pid);
		}, timeoutMs);
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({
				code: timedOut ? 124 : (code ?? 1),
				output: decodeUtf8Chunks(outputCollector.chunks),
				timedOut,
			});
		});
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({
				code: 127,
				output: String(error),
				timedOut: false,
			});
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

/**
 * x00097 S5: argv-first async runner — NO shell, ever. The first element
 * is the binary, the rest are literal arguments, so no caller-supplied
 * string is subject to shell parsing/injection and the event loop never
 * blocks (audit a00052 #16 replaced `Bun.spawnSync` call sites with
 * this). Missing binary resolves `{code: 127}`, mirroring the shell
 * convention callers already branch on.
 */
export const runArgv = (
	argv: readonly string[],
	options: IRunArgvOptions = {},
): Promise<IRunArgvOutcome> =>
	new Promise<IRunArgvOutcome>((resolve) => {
		const [binary, ...args] = argv;
		if (binary === undefined) {
			resolve({
				code: 127,
				stdout: '',
				stderr: 'runArgv: empty argv',
				timedOut: false,
			});
			return;
		}
		const timeoutMs = options.timeoutMs ?? 600_000;
		const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;
		const totalCollector = createByteCollector(maxOutputBytes);
		const stdoutCollector = createByteCollector(options.maxStdoutBytes);
		const stderrCollector = createByteCollector(options.maxStderrBytes);
		let timedOut = false;
		let timeoutTeardown: Promise<void> | undefined;
		const child = spawn(binary, args, {
			...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
			...(process.platform === 'win32' ? {} : { detached: true }),
			stdio: [
				options.stdin !== undefined ? 'pipe' : 'ignore',
				'pipe',
				'pipe',
			],
		});
		if (options.stdin !== undefined) {
			child.stdin?.end(options.stdin);
		}
		child.stdout?.on('data', (chunk: Buffer) => {
			captureUtf8Bytes(stdoutCollector, chunk, totalCollector);
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			captureUtf8Bytes(stderrCollector, chunk, totalCollector);
		});
		const timer = setTimeout(() => {
			timedOut = true;
			timeoutTeardown = killProcessTree(child.pid);
		}, timeoutMs);
		child.on('close', async (code) => {
			clearTimeout(timer);
			await timeoutTeardown;
			resolve({
				code: timedOut ? 124 : (code ?? 1),
				stdout: decodeUtf8Chunks(stdoutCollector.chunks),
				stderr: decodeUtf8Chunks(stderrCollector.chunks),
				timedOut,
			});
		});
		child.on('error', async (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			await timeoutTeardown;
			resolve({
				code: error.code === 'ENOENT' ? 127 : 126,
				stdout: decodeUtf8Chunks(stdoutCollector.chunks),
				stderr: String(error),
				timedOut: false,
			});
		});
	});
