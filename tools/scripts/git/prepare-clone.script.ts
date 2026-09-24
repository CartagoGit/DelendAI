#!/usr/bin/env bun
/**
 * prepare-clone.script.ts — set the clone up once, from its main checkout.
 *
 * Every step here writes something every worktree of the clone shares:
 * `.git/config` (the guard's runner and entry, the generated-file merge
 * driver, fetch pruning) and `.git/hooks`. Run from a linked worktree, they
 * wrote THAT worktree's absolute path into the shared config. The owner
 * machine's hydrator installs dependencies in a throwaway worktree, so on
 * 2026-09-24 the guard entry pointed at a directory that was deleted a
 * minute later, and every branch creation in the clone, a person's
 * included, was refused by a hook that could not start.
 *
 * So a linked worktree sets nothing up: it uses what the main checkout
 * configured. The main checkout runs the same steps as before, in order.
 */
import { execFileSync } from 'node:child_process';

/** The steps, as `bun` or program arguments, in the order they run. */
export const PREPARE_STEPS: readonly (readonly string[])[] = [
	['bun', 'tools/scripts/git/clone-hygiene.script.ts'],
	['bun', 'tools/scripts/sync-git-hooks.script.ts'],
	['lefthook', 'install'],
	['bun', 'tools/scripts/git/harden-git-hooks.script.ts'],
	[
		'bun',
		'packages/cli/src/index.ts',
		'--workspace=.',
		'guard',
		'install',
		'--alongside-manager',
	],
];

const git = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * True in a linked worktree: its git directory is its own, not the
 * common one. Outside a repository there is nothing shared to protect.
 */
export const isLinkedWorktree = (cwd: string): boolean => {
	const own = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir']);
	const common = git(cwd, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	return own !== undefined && common !== undefined && own !== common;
};

const main = (): void => {
	const cwd = process.cwd();
	if (isLinkedWorktree(cwd)) {
		console.log(
			'prepare: a linked worktree shares its clone configuration; the main checkout sets it up.',
		);
		return;
	}
	for (const [command, ...args] of PREPARE_STEPS) {
		if (command === undefined) continue;
		// `lefthook` is a dependency; run the installed one.
		const program =
			command === 'lefthook' ? 'node_modules/.bin/lefthook' : command;
		execFileSync(program, args, { cwd, stdio: 'inherit' });
	}
};

if (import.meta.main) main();
