import { spawn, type ChildProcess } from 'node:child_process';

import type { IValidationCommand } from '@mcp-vertex/core/public';
import { killProcessGroup } from '@mcp-vertex/core/public';

import { evaluateCommandPolicy, type ICommandPolicy } from './command-policy';

// In-flight spawned children, so `quality_cancel` can abort a long-running scope
// instead of waiting for the timeout (A2). Each child is spawned `detached` so
// killing `-pid` reaps the whole process group (shell + the real command),
// leaving no orphans — same canonical teardown as the acceptance runner (M25).
const activeChildren = new Set<ChildProcess>();

const killGroup = (child: ChildProcess): void => killProcessGroup(child.pid);

/** PIDs of quality commands currently running in this process. */
export const activeRunPids = (): number[] =>
	[...activeChildren]
		.map((c) => c.pid)
		.filter((pid): pid is number => pid !== undefined);

/**
 * Abort running quality commands. With `pid`, only that one; otherwise all of
 * them. Returns the PIDs that were signalled (SIGKILL on the process group).
 */
export const cancelActiveRuns = (pid?: number): number[] => {
	const killed: number[] = [];
	for (const child of activeChildren) {
		if (pid !== undefined && child.pid !== pid) continue;
		if (child.pid !== undefined) {
			killGroup(child);
			killed.push(child.pid);
		}
	}
	return killed;
};

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
	cwd: string,
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
				detached: true, // own process group → `quality_cancel`/timeout reap the whole tree
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			activeChildren.add(child);
			const done = (outcome: IRunOutcome): void => {
				activeChildren.delete(child);
				resolve(outcome);
			};
			const capture = (chunk: Buffer): void => {
				if (output.length < maxOutputBytes) output += chunk.toString();
			};
			child.stdout?.on('data', capture);
			child.stderr?.on('data', capture);
			const timer = setTimeout(() => {
				timedOut = true;
				killGroup(child);
			}, timeoutMs);
			child.on('close', (code) => {
				clearTimeout(timer);
				done({ code: timedOut ? 124 : (code ?? 1), output, timedOut });
			});
			child.on('error', (error) => {
				clearTimeout(timer);
				done({ code: 127, output: String(error), timedOut: false });
			});
		});

const tailOf = (text: string, lines = 20): string =>
	text
		.split('\n')
		.filter((l) => l.length > 0)
		.slice(-lines)
		.join('\n');

/**
 * Alias of the core public type `IValidationCommand`. The plugin used
 * to redefine this locally with `expect?` optional, but the core
 * schema requires `expect` and the runner doesn't branch on it
 * (it just measures the real exit code). Keeping a single source of
 * truth here means `plugins/quality` and the core's host-config
 * agree on the shape of a validation command.
 */
export type IScopeCommand = IValidationCommand;

/**
 * Run every command of a scope in order; ok only if all succeed. A command
 * blocked by `policy` is NOT spawned — it is recorded as a failed result
 * (code 126) so the agent sees why (M13).
 */
export const runScope = async (
	scope: string,
	commands: readonly IScopeCommand[],
	cwd: string,
	run: ICommandRunner,
	policy?: ICommandPolicy,
): Promise<IScopeResult> => {
	const results: ICommandResult[] = [];
	for (const entry of commands) {
		const verdict = evaluateCommandPolicy(entry.command, policy);
		if (!verdict.allowed) {
			results.push({
				command: entry.command,
				ok: false,
				code: 126,
				timedOut: false,
				tail: `blocked by command policy: ${verdict.reason}`,
			});
			continue;
		}
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
