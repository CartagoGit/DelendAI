#!/usr/bin/env bun
/**
 * advance-queue.script.ts — the queue moves after every certification
 * (x00680, x00683).
 *
 * The queue arms its head only on a certified integration branch, and
 * nothing started it again once that certification finished. Merges made
 * with the workflow token fire no `push` workflow, and the scheduled
 * trigger runs the default branch's copy of the workflow, which lags the
 * integration branch. After each merge the queue sat idle, with green
 * candidates, until somebody dispatched it by hand.
 *
 * The local hydrator runs this on every pass, on the machine holding the
 * forge credential: when the integration branch moves, and on the host
 * server's clock. One pass never waits. It reads the tip's certification
 * once, and when that has finished it dispatches the queue, once per tip:
 * the tip it dispatched for is remembered. A pass that finds the
 * certification still running leaves it to the next one. Waiting inside
 * the pass (x00680) held the hydration lock for up to 50 minutes, and
 * every other pass, the ones that bring candidates forward, stepped
 * aside for as long.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readTextIfPresent } from '../lib/read-text-if-present';
import { dirname, join } from 'node:path';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';
import {
	CERTIFYING_WORKFLOW,
	certificationOf,
	type ICertificationRun,
} from './certify-integration.script';

const QUEUE_WORKFLOW = 'keep-the-queue-moving.yml';
/** The integration tip the queue was last dispatched for. */
const ADVANCED_FOR_PATH = '.cache/delendai/results/queue-advanced-for.txt';

/** What this pass does about the tip. */
export const nextStep = (input: {
	readonly certification: string;
	readonly tip: string;
	readonly advancedFor: string | undefined;
}): 'dispatch' | 'wait' | 'done' => {
	if (input.advancedFor === input.tip) return 'done';
	// A red integration branch still gets its queue run: the queue's
	// repair path arms the candidate that turns it green.
	return input.certification === 'certified' || input.certification === 'red'
		? 'dispatch'
		: 'wait';
};

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
		run('git', ['ls-remote', 'origin', `refs/heads/${integration}`]).split(
			'\t',
		)[0] ?? '';
	if (tip === '') return 0;
	const recordPath = join(root, ADVANCED_FOR_PATH);
	const advancedFor = readTextIfPresent(recordPath)?.trim();
	const runs = JSON.parse(
		run('gh', [
			'api',
			`repos/{owner}/{repo}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?head_sha=${tip}&per_page=50`,
			'--jq',
			'.workflow_runs',
		]),
	) as readonly ICertificationRun[];
	const certification = certificationOf(runs, tip);
	const step = nextStep({ certification, tip, advancedFor });
	const short = tip.slice(0, 9);
	if (step === 'done') return 0;
	if (step === 'wait') {
		console.log(
			`advance-queue: ${integration} at ${short} is ${certification}; the next pass dispatches the queue once it is certified.`,
		);
		return 0;
	}
	if (!process.argv.includes('--apply')) {
		console.log(
			`advance-queue: ${integration} at ${short} is ${certification}; the queue is due (read-only; pass --apply).`,
		);
		return 0;
	}
	run('gh', ['workflow', 'run', QUEUE_WORKFLOW, '--ref', integration]);
	mkdirSync(dirname(recordPath), { recursive: true });
	writeFileSync(recordPath, `${tip}\n`);
	console.log(
		`advance-queue: ${integration} at ${short} is ${certification}; the queue was dispatched.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
