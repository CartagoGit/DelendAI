#!/usr/bin/env bun

/**
 * sync:workspace — the single thing an agent runs to make its clone
 * match reality, and the single thing a host runs at startup.
 *
 * WHY ONE COMMAND: the three operations below were each reachable on
 * their own, which meant every agent had to know all three existed, in
 * what order, and which flags made them safe. Fifteen agents working at
 * once will not each get that right, and the ones that get it wrong
 * leave exactly the debris this is supposed to remove. A composite with
 * one name is the only version of this that survives a swarm.
 *
 * ORDER IS THE CONTRACT, not a convenience:
 *
 *   1. advance the integration branch — so everything after it judges
 *      against what the forge actually has;
 *   2. reap spent local branches — which needs the prune from step 1 to
 *      tell a merged branch from a live one;
 *   3. report what is still in flight — so an agent reading this output
 *      can tell "nothing to do" from "nothing was looked at".
 *
 * Run without `--apply` it changes nothing and prints the same verdicts.
 */

import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/repo-root';

const APPLY = process.argv.includes('--apply');

/** Run one step, and let its own output speak. */
const step = (title: string, script: string): number => {
	console.log(`\n── ${title} ──`);
	try {
		const out = execFileSync(
			'bun',
			[script, ...(APPLY ? ['--apply'] : [])],
			{ cwd: repoRoot(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
		);
		process.stdout.write(out);
		return 0;
	} catch (error) {
		const shell = error as { stdout?: string; stderr?: string };
		process.stdout.write(shell.stdout ?? '');
		process.stderr.write(shell.stderr ?? '');
		return 1;
	}
};

const main = (): number => {
	// A step that refuses is reported and the rest still run. Each is
	// independently safe, and stopping at the first refusal would mean
	// one diverged branch prevents the clone from being tidied at all —
	// which is how the debris accumulates in the first place.
	const failures = [
		step(
			'integration branch',
			'tools/scripts/forge/sync-with-integration.script.ts',
		),
		step('local branches', 'tools/scripts/reclaim/reclaim-local.script.ts'),
	].filter((code) => code !== 0).length;

	console.log(
		`\nsync:workspace: ${failures === 0 ? 'clone matches the forge' : `${failures} step(s) need a decision that is not this tool's to make`}${APPLY ? '' : ' (read-only; pass --apply)'}.`,
	);
	return failures === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
