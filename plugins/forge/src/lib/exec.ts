import { spawn } from 'node:child_process';

const REDACTION_PATTERNS = [
	/gh[pousr]*_[A-Za-z0-9_]{32,}/u,
	/glpat-[A-Za-z0-9_]{20,}/u,
];

export interface IForgeExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly timedOut: boolean;
}

export interface ISpawnedProcess {
	readonly stdout?: NodeJS.ReadableStream | null;
	readonly stderr?: NodeJS.ReadableStream | null;
	on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): this;
	on(event: 'close', listener: (code: number | null) => void): this;
	kill(signal?: NodeJS.Signals | number): boolean;
}

export type ISpawnLike = (
	command: string,
	args: readonly string[],
	options: { cwd?: string; env?: NodeJS.ProcessEnv; stdio: 'pipe' },
) => ISpawnedProcess;

export interface IForgeExecOptions {
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly timeoutMs?: number;
	readonly spawnFn?: ISpawnLike;
}

export class MissingCliError extends Error {
	readonly cli: 'gh' | 'glab';
	readonly hint: string;

	constructor(cli: 'gh' | 'glab') {
		super(`Missing required CLI: ${cli}. ${installHintForCli(cli)}`);
		this.name = 'MissingCliError';
		this.cli = cli;
		this.hint = installHintForCli(cli);
	}
}

export const installHintForCli = (cli: 'gh' | 'glab'): string =>
	cli === 'gh'
		? "Install GitHub CLI with `brew install gh` or `sudo apt install gh`. Use the host session's existing auth; no PAT is stored here."
		: "Install GitLab CLI with `brew install glab` or `sudo apt install glab`. Use the host session's existing auth; no PAT is stored here.";

export const redactForgeOutput = (output: string): string =>
	output
		.split(/\r?\n/u)
		.filter(
			(line) =>
				line.length === 0 ||
				!REDACTION_PATTERNS.some((pattern) => pattern.test(line)),
		)
		.join('\n');

export const defaultSpawn: ISpawnLike = (command, args, options) =>
	spawn(command, [...args], options) as unknown as ISpawnedProcess;

const runCli = async (
	cli: 'gh' | 'glab',
	args: readonly string[],
	options: IForgeExecOptions = {},
): Promise<IForgeExecResult> =>
	new Promise((resolve, reject) => {
		const child = (options.spawnFn ?? defaultSpawn)(cli, args, {
			...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
			...(options.env !== undefined ? { env: options.env } : {}),
			stdio: 'pipe',
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let settled = false;
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(
				new Error(
					`${cli} timed out after ${options.timeoutMs ?? 15000}ms`,
				),
			);
		}, options.timeoutMs ?? 15000);
		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(
				typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
			);
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrChunks.push(
				typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
			);
		});
		child.on('error', (error: NodeJS.ErrnoException) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error.code === 'ENOENT') {
				reject(new MissingCliError(cli));
				return;
			}
			reject(error);
		});
		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			const stdout = redactForgeOutput(
				Buffer.concat(stdoutChunks).toString(),
			);
			const stderr = redactForgeOutput(
				Buffer.concat(stderrChunks).toString(),
			);
			if (timedOut) return;
			if ((code ?? 1) !== 0) {
				reject(
					new Error(
						`${cli} ${args.join(' ')} failed: ${stderr.trim() || stdout.trim() || `exit ${code ?? 1}`}`,
					),
				);
				return;
			}
			resolve({
				stdout,
				stderr,
				exitCode: code ?? 0,
				timedOut: false,
			});
		});
	});

export const runGh = (
	args: readonly string[],
	options?: IForgeExecOptions,
): Promise<IForgeExecResult> => runCli('gh', args, options);

export const runGlab = (
	args: readonly string[],
	options?: IForgeExecOptions,
): Promise<IForgeExecResult> => runCli('glab', args, options);
