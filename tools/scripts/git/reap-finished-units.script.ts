#!/usr/bin/env bun
/**
 * reap-finished-units — what a finished unit leaves on this machine and
 * on the forge is removed by the pass that runs after every merge.
 *
 * `delendai work reap` already knew what was spent: the worktree and the
 * local branch of a delivered unit, a directory beside the units that is
 * no unit, a retired ref whose work the integration branch came to hold,
 * a slice reservation whose unit is gone. Nothing ran it. After the swarm
 * of 2026-10-11 four worktrees and their branches stood here for units
 * the forge had retired, a reservation outlived the pull request that
 * landed its slice, and each of them was somebody's to remember.
 *
 *   bun tools/scripts/git/reap-finished-units.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/repo-root';

/** The command the pass runs: the product's own reaper, as a person runs it. */
export const reapCommand = (apply: boolean): readonly string[] => [
	'packages/cli/src/index.ts',
	'--json',
	'work',
	'reap',
	...(apply ? ['--apply'] : []),
];

/** One line per kind of thing reaped, from the reaper's answer. */
export const summarise = (answer: unknown): string => {
	const data =
		(answer as { data?: Record<string, unknown> } | undefined)?.data ??
		(answer as Record<string, unknown> | undefined) ??
		{};
	const counted = Object.entries(data)
		.filter(([, value]) => Array.isArray(value) && value.length > 0)
		.map(
			([kind, value]) => `${String((value as unknown[]).length)} ${kind}`,
		);
	return counted.length === 0 ? 'nothing to reap' : counted.join(', ');
};

const main = (): number => {
	const apply = process.argv.includes('--apply');
	const out = execFileSync('bun', [...reapCommand(apply)], {
		cwd: repoRoot(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		env: {
			...process.env,
			// The owner's automation, not an agent's shell.
			CLAUDECODE: '',
			AI_AGENT: '',
			DELENDAI_AGENT_ID: '',
		},
	});
	let answer: unknown;
	try {
		answer = JSON.parse(out);
	} catch {
		answer = undefined;
	}
	console.log(
		`reap-finished-units: ${summarise(answer)}${apply ? '' : ' (read-only; pass --apply)'}.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
