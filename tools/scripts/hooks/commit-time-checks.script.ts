#!/usr/bin/env bun
/**
 * commit-time-checks.script.ts — what fails in seconds fails at the commit.
 *
 * A stale AGENT.md, a budget or a cast were found by a proof, or by the forge
 * minutes after the commit that caused them. These answer in seconds, so the
 * commit asks them, chosen by what it touches: a generated file is regenerated
 * and staged, since nobody has a decision to make about it.
 */
import { spawn, spawnSync } from 'node:child_process';

const TYPESCRIPT = /\.tsx?$/u;
/** What can change what a tool costs or tells the site. */
const TOOL_SURFACE =
	/(\.tool\.ts|plugin\.manifest\.ts|-schema\.constant\.ts|tool-surface.*\.ts)$/u;

const LINTS: readonly (readonly string[])[] = [
	['bun', 'run', 'lint:test-unsafe-casts'],
	['bun', 'run', 'lint:types-in-contracts'],
	['bun', 'run', 'lint:file-conventions'],
	['bun', 'run', 'lint:solid'],
];

const TOOL_CHECKS: readonly (readonly string[])[] = [
	['bun', 'tools/scripts/test/run-actual-preset-budget.script.ts'],
	['bun', 'apps/web/scripts/gen-capabilities.ts', '--strict'],
];

/** The checks a commit of `paths` needs. Pure. */
export const checksFor = (
	paths: readonly string[],
): readonly (readonly string[])[] => {
	const code = paths.filter((path) => TYPESCRIPT.test(path));
	if (code.length === 0) return [];
	return [
		...LINTS,
		...(code.some((path) => TOOL_SURFACE.test(path)) ? TOOL_CHECKS : []),
	];
};

const git = (...args: readonly string[]): string =>
	spawnSync('git', [...args], { encoding: 'utf8' }).stdout ?? '';

/** Regenerate the agent notes and stage only what that changed. */
const syncAgentNotes = (): void => {
	spawnSync('bun', ['tools/scripts/gen/agent-md.script.ts'], {
		stdio: 'ignore',
	});
	const changed = git('diff', '--name-only', '--', '*AGENT.md')
		.split('\n')
		.filter((path) => path.length > 0);
	if (changed.length > 0) git('add', '--', ...changed);
};

const failureOf = (command: readonly string[]): Promise<string | undefined> =>
	new Promise((resolve) => {
		const [bin = 'bun', ...args] = command;
		const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', (chunk) => {
			output += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			output += String(chunk);
		});
		child.on('close', (code) => {
			resolve(code === 0 ? undefined : output);
		});
	});

const main = async (): Promise<number> => {
	const paths = git('diff', '--cached', '--name-only', '--diff-filter=d')
		.split('\n')
		.filter((path) => path.length > 0);
	const checks = checksFor(paths);
	if (checks.length === 0) return 0;
	syncAgentNotes();
	const failures = await Promise.all(checks.map(failureOf));
	for (const failure of failures) {
		if (failure !== undefined) process.stderr.write(failure);
	}
	return failures.some((failure) => failure !== undefined) ? 1 : 0;
};

if (import.meta.main) process.exit(await main());
