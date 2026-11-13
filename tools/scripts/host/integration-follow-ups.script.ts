#!/usr/bin/env bun
/**
 * integration-follow-ups.script.ts — what this repository runs on the host
 * after its checkout follows the integration branch, read from the checkout
 * at every run.
 *
 *   bun tools/scripts/host/integration-follow-ups.script.ts --on=move|event
 *
 * The host server runs this one script; the list lives here, not in the
 * server's code. A server started days ago ran the list it was started
 * with, so a step added since (bringing labelled pull requests forward)
 * never ran until somebody restarted it.
 *
 * `move`: the checkout just followed the integration branch. Every step
 * runs, once per move.
 * `event`: the forge said something changed that waits on this machine
 * (a pull request labelled for update). Only the steps that pick up such
 * work run. Nothing calls it on a timer: the forge-event receiver runs it,
 * so the work happens when the forge says, not when a poll notices.
 *
 * Local only: the host fetches and fast-forwards, reads the forge, and
 * records what it read. It does no integration write: bringing a head
 * forward and opening batches are the integrator's, as the App identity,
 * and a publication's pull request is opened by `work publish`.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { integrationProtocolRefusal } from '@delendai/core/cli';
import { backgroundEnv, lowPriority } from '@delendai/core/runtime';

/** One follow-up: its script, its timeout, and whether a forge event runs it. */
export interface IFollowUp {
	readonly script: string;
	readonly timeoutMs: number;
	readonly onEvent: boolean;
}

/** In order. Steps of the retired queue never come back here. */
export const INTEGRATION_FOLLOW_UPS: readonly IFollowUp[] = [
	{
		// Evidence `proposal_transition` reads: what the tip's runs concluded.
		script: 'tools/scripts/forge/certify-integration.script.ts',
		timeoutMs: 60_000,
		onEvent: false,
	},
	{
		// A proposal whose every slice is approved closes.
		script: 'tools/scripts/proposals/close-approved-proposals.script.ts',
		timeoutMs: 600_000,
		onEvent: false,
	},
];

/**
 * Why a process may not run the follow-ups: it speaks an older integration
 * protocol than the repository records, so every integration action is
 * refused until it restarts. `undefined` when it may run them.
 */
export const followUpsRefusal = (
	recorded: number,
	spoken?: number,
): string | undefined => {
	const stale = integrationProtocolRefusal(recorded, spoken);
	return stale === undefined ? undefined : `${stale.reason} ${stale.remedy}`;
};

/** The steps one occasion runs. Pure. */
export const followUpsFor = (
	on: 'move' | 'event',
	steps: readonly IFollowUp[] = INTEGRATION_FOLLOW_UPS,
): readonly IFollowUp[] =>
	on === 'move' ? steps : steps.filter((step) => step.onEvent);

const main = async (): Promise<number> => {
	const on = process.argv
		.find((arg) => arg.startsWith('--on='))
		?.slice('--on='.length);
	if (on !== 'move' && on !== 'event') {
		console.error(
			'usage: integration-follow-ups.script.ts --on=move|event',
		);
		return 2;
	}
	const root = process.cwd();
	const run = promisify(execFile);
	for (const step of followUpsFor(on)) {
		if (!existsSync(join(root, step.script))) continue;
		const command = lowPriority('bun', [step.script, '--apply']);
		try {
			await run(command.command, [...command.args], {
				cwd: root,
				timeout: step.timeoutMs,
				env: backgroundEnv(),
			});
		} catch (error) {
			// Never fatal: the next occasion runs it again.
			process.stderr.write(
				`[delendai] ${step.script} did not complete: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	}
	return 0;
};

if (import.meta.main) process.exit(await main());
