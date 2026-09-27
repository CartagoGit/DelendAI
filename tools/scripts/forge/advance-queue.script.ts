#!/usr/bin/env bun
/**
 * advance-queue.script.ts — the queue moves after every certification
 * (x00680).
 *
 * The queue arms its head only on a certified integration branch, and
 * nothing started it again once that certification finished. Merges made
 * with the workflow token fire no `push` workflow, and the scheduled
 * trigger runs the default branch's copy of the workflow, which lags the
 * integration branch. After each merge the queue sat idle, with green
 * candidates, until somebody dispatched it by hand.
 *
 * The local hydrator runs this after the integration branch moves, on the
 * machine holding the forge credential. It waits for the tip's
 * certification to finish, then dispatches the queue once. If the tip
 * moves meanwhile, the hydration of that move does it instead.
 */
import { execFileSync } from 'node:child_process';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';
import {
	CERTIFYING_WORKFLOW,
	certificationOf,
	type ICertificationRun,
} from './certify-integration.script';

const QUEUE_WORKFLOW = 'keep-the-queue-moving.yml';
const POLL_MS = 30_000;
const PATIENCE_MS = 50 * 60_000;

/** What to do with the tip's certification in this state. */
export const nextStep = (input: {
	readonly certification: string;
	readonly tipMoved: boolean;
	readonly waitedMs: number;
}): 'wait' | 'dispatch' | 'stand-down' | 'give-up' => {
	if (input.tipMoved) return 'stand-down';
	// A red integration branch still gets its queue run: the queue's
	// repair path arms the candidate that turns it green.
	if (input.certification === 'certified' || input.certification === 'red')
		return 'dispatch';
	return input.waitedMs >= PATIENCE_MS ? 'give-up' : 'wait';
};

const run = (command: string, args: readonly string[]): string =>
	execFileSync(command, [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const remoteTip = (integration: string): string =>
	run('git', ['ls-remote', 'origin', `refs/heads/${integration}`]).split(
		'\t',
	)[0] ?? '';

const main = async (): Promise<number> => {
	const integration = declaredBranches(repoRoot()).integration;
	const tip = remoteTip(integration);
	const started = Date.now();
	for (;;) {
		const runs = JSON.parse(
			run('gh', [
				'api',
				`repos/{owner}/{repo}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?head_sha=${tip}&per_page=50`,
				'--jq',
				'.workflow_runs',
			]),
		) as readonly ICertificationRun[];
		const step = nextStep({
			certification: certificationOf(runs, tip),
			tipMoved: remoteTip(integration) !== tip,
			waitedMs: Date.now() - started,
		});
		if (step === 'dispatch') {
			if (process.argv.includes('--apply')) {
				run('gh', [
					'workflow',
					'run',
					QUEUE_WORKFLOW,
					'--ref',
					integration,
				]);
			}
			console.log(
				`advance-queue: ${integration} at ${tip.slice(0, 9)} finished its certification; the queue was ${process.argv.includes('--apply') ? 'dispatched' : 'due (dry run)'}.`,
			);
			return 0;
		}
		if (step === 'stand-down' || step === 'give-up') {
			console.log(
				step === 'stand-down'
					? `advance-queue: ${integration} moved past ${tip.slice(0, 9)}; its own hydration advances the queue.`
					: `advance-queue: ${integration} at ${tip.slice(0, 9)} is still uncertified after ${String(PATIENCE_MS / 60_000)} minutes; dispatch ${QUEUE_WORKFLOW} by hand once it is.`,
			);
			return 0;
		}
		await Bun.sleep(POLL_MS);
	}
};

if (import.meta.main) process.exit(await main());
