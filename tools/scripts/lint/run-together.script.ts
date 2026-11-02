#!/usr/bin/env bun
/**
 * run-together.script.ts — the lints of a chain, at once, every failure named.
 *
 * A chain in `package.json` is the one list of what a job checks. Run with
 * `&&` it took the sum of its lints and stopped at the first failure, so each
 * further problem cost another proof. A lint reads and reports, which is why
 * they can share a machine; a chain that writes must not come through here.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

/** The commands of a `package.json` script. Pure. */
export const commandsOf = (chain: string): readonly string[] =>
	chain
		.split('&&')
		.map((command) => command.trim())
		.filter((command) => command.length > 0);

/** Map `items` with at most `limit` running at once. */
export const inPool = async <T, R>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<R>,
): Promise<readonly R[]> => {
	const results: R[] = [];
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const index = next;
			next += 1;
			const item = items[index];
			if (item !== undefined) results[index] = await work(item);
		}
	};
	await Promise.all(Array.from({ length: limit }, worker));
	return results;
};

interface ICommandRun {
	readonly command: string;
	readonly code: number;
	readonly output: string;
}

const runCommand = (command: string): Promise<ICommandRun> =>
	new Promise((resolve) => {
		// No stdin: a gate that reads one would wait for it for ever.
		const child = spawn(command, {
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		const keep = (chunk: unknown): void => {
			output += String(chunk);
		};
		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		child.on('close', (code) => {
			resolve({ command, code: code ?? 1, output });
		});
	});

const main = async (names: readonly string[]): Promise<number> => {
	const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
		readonly scripts: Readonly<Record<string, string>>;
	};
	const commands = names.flatMap((name) => {
		const chain = scripts[name];
		if (chain === undefined) throw new Error(`no script "${name}"`);
		return commandsOf(chain);
	});
	const started = Date.now();
	const runs = await inPool(commands, availableParallelism(), runCommand);
	const failed = runs.filter((run) => run.code !== 0);
	for (const run of failed) {
		process.stdout.write(`\n✖ ${run.command}\n${run.output}\n`);
	}
	console.log(
		`${names.join(' ')}: ${String(runs.length - failed.length)}/${String(runs.length)} passed in ${String(Math.round((Date.now() - started) / 1000))}s`,
	);
	return failed.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
