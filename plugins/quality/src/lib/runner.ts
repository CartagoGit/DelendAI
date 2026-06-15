import { spawn } from 'node:child_process';

export interface ICommandResult {
	readonly command: string;
	readonly ok: boolean;
	readonly code: number;
	readonly timedOut: boolean;
	/** Last lines of combined output (kept short for low tokens). */
	readonly tail: string;
}

export interface IScopeResult {
	readonly scope: string;
	readonly ok: boolean;
	readonly results: readonly ICommandResult[];
}

export interface IRunOutcome {
	readonly code: number;
	readonly output: string;
	readonly timedOut: boolean;
}

/**
 * Runs a shell command in `cwd`, never throws, never blocks the event
 * loop (async spawn). Output is captured with a cap so a verbose
 * command can't exhaust memory; a timeout kills the process and is
 * reported distinctly (code 124). Injectable for tests.
 */
export type ICommandRunner = (
	command: string,
	cwd: string
) => Promise<IRunOutcome>;

export const createCommandRunner =
	(timeoutMs = 600_000, maxOutputBytes = 64 * 1024): ICommandRunner =>
	(command, cwd) =>
		new Promise<IRunOutcome>((resolve) => {
			let output = '';
			let timedOut = false;
			const child = spawn(command, {
				cwd,
				shell: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			const capture = (chunk: Buffer): void => {
				if (output.length < maxOutputBytes) output += chunk.toString();
			};
			child.stdout?.on('data', capture);
			child.stderr?.on('data', capture);
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill('SIGKILL');
			}, timeoutMs);
			child.on('close', (code) => {
				clearTimeout(timer);
				resolve({
					code: timedOut ? 124 : (code ?? 1),
					output,
					timedOut,
				});
			});
			child.on('error', (error) => {
				clearTimeout(timer);
				resolve({ code: 127, output: String(error), timedOut: false });
			});
		});

const tailOf = (text: string, lines = 20): string =>
	text.split('\n').filter((l) => l.length > 0).slice(-lines).join('\n');

export interface IScopeCommand {
	readonly command: string;
	readonly expect?: string;
}

/** Run every command of a scope in order; ok only if all succeed. */
export const runScope = async (
	scope: string,
	commands: readonly IScopeCommand[],
	cwd: string,
	run: ICommandRunner
): Promise<IScopeResult> => {
	const results: ICommandResult[] = [];
	for (const entry of commands) {
		const r = await run(entry.command, cwd);
		results.push({
			command: entry.command,
			ok: r.code === 0,
			code: r.code,
			timedOut: r.timedOut,
			tail: tailOf(r.output),
		});
	}
	return { scope, ok: results.every((r) => r.ok), results };
};
