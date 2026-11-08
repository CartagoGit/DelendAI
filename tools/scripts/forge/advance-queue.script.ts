#!/usr/bin/env bun
/**
 * advance-queue.script.ts — the queue moves after every merge.
 *
 * Merges made with the workflow token fire no `push` workflow, and the
 * scheduled trigger runs the default branch's copy of the workflow, which
 * lags the integration branch. After each merge the queue sat idle, with
 * green candidates, until somebody dispatched it by hand.
 *
 * The local hydrator runs this on every pass, on the machine holding the
 * forge credential: when the integration branch moves, and on the host
 * server's clock. It dispatches the queue once per tip, and remembers the
 * tip it dispatched for. It waits for no full run of the tip: what landed
 * was proved by its sectioned run, and the full suite runs on the
 * promotion.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readTextIfPresent } from '../lib/read-text-if-present';
import { dirname, join } from 'node:path';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

const QUEUE_WORKFLOW = 'keep-the-queue-moving.yml';
/** The integration tip the queue was last dispatched for. */
const ADVANCED_FOR_PATH = '.cache/delendai/results/queue-advanced-for.txt';

/** What this pass does about the tip: dispatch the queue once per tip. */
export const nextStep = (input: {
	readonly tip: string;
	readonly advancedFor: string | undefined;
}): 'dispatch' | 'done' =>
	input.advancedFor === input.tip ? 'done' : 'dispatch';

const run = (command: string, args: readonly string[]): string =>
	execFileSync(command, [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const main = (): number => {
	const root = repoRoot();
	const integration = declaredBranches(root).integration;
	const tip =
		run('git', [
			'ls-remote',
			'--',
			'origin',
			`refs/heads/${integration}`,
		]).split('\t')[0] ?? '';
	if (tip === '') return 0;
	const recordPath = join(root, ADVANCED_FOR_PATH);
	const advancedFor = readTextIfPresent(recordPath)?.trim();
	const step = nextStep({ tip, advancedFor });
	const short = tip.slice(0, 9);
	if (step === 'done') return 0;
	if (!process.argv.includes('--apply')) {
		console.log(
			`advance-queue: ${integration} moved to ${short}; the queue is due (read-only; pass --apply).`,
		);
		return 0;
	}
	run('gh', ['workflow', 'run', QUEUE_WORKFLOW, '--ref', integration]);
	mkdirSync(dirname(recordPath), { recursive: true });
	writeFileSync(recordPath, `${tip}\n`);
	console.log(
		`advance-queue: ${integration} moved to ${short}; the queue was dispatched.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
