/**
 * A parked run is the failure mode with no red check to look at.
 *
 * When a branch update is written by a bot the forge does not start the
 * workflows it triggers; it files them as `action_required` and waits
 * for a human. The pull request then shows no failing check at all — the
 * required aggregate is ABSENT, not red — and stays permanently
 * unmergeable. Observed on #86, which sat that way with five parked runs
 * while the checks list showed a single green third-party scanner.
 *
 * These cases pin the one decision that distinguishes "parked" from
 * every other run state, because getting it wrong in either direction is
 * silent: too narrow and the queue stays stuck, too wide and the job
 * starts approving runs the forge deliberately held back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type IWorkflowRun, parkedRuns } from './keep-the-queue-moving.script';

const run = (name: string, conclusion: string | null): IWorkflowRun => ({
	id: name.length,
	name,
	conclusion,
});

describe('parkedRuns', () => {
	it('picks out the run the forge refused to start', () => {
		expect(
			parkedRuns([run('CI', 'action_required')]).map((each) => each.name),
		).toEqual(['CI']);
	});

	it('leaves a failure alone — that one has something to fix', () => {
		expect(parkedRuns([run('CI', 'failure')])).toEqual([]);
	});

	it('leaves a run that is still going, which needs no permission', () => {
		expect(parkedRuns([run('CI', null)])).toEqual([]);
	});

	it('leaves a cancelled run alone, which this repo produces constantly', () => {
		expect(parkedRuns([run('CI', 'cancelled')])).toEqual([]);
	});

	it('names every parked run and only those', () => {
		expect(
			parkedRuns([
				run('CI', 'action_required'),
				run('drift', 'success'),
				run('tier1', 'action_required'),
				run('affected', 'failure'),
			]).map((each) => each.name),
		).toEqual(['CI', 'tier1']);
	});
});

/**
 * The counter that lied.
 *
 * `released` incremented once per UPDATE, not once per release, so the
 * job reported `5 re-validated` having released nothing — twenty-one
 * runs were parked across five pull requests behind that line, and I
 * quoted it as evidence the mechanism worked.
 *
 * The lesson is not "count carefully". It is that a number reported by
 * the thing it is measuring must be derived from the outcome, never
 * from the attempt — otherwise the only number anybody reads is the one
 * that cannot be wrong, and it is the one that is.
 */
describe('what the summary is allowed to claim', () => {
	const source = readFileSync(
		join(__dirname, 'keep-the-queue-moving.script.ts'),
		'utf8',
	)
		.replace(/\/\*[\s\S]*?\*\//gu, '')
		.replace(/^\s*\/\/.*$/gmu, '');

	it('never increments the release count by a literal', () => {
		expect(source).not.toMatch(/released\s*\+=\s*1\b/u);
	});

	it('derives it from what the release call reported', () => {
		expect(source).toMatch(/released\s*\+=\s*\w+\.released/u);
	});

	// The invariant that replaced the wait. Waiting for the runs an
	// update triggers was the right fix for the wrong problem: the job
	// should not be writing commits at all. `update-branch` writes its
	// commit as the token that made it — a bot, here, always — and the
	// forge will not build a bot's commit. Twenty-one parked runs across
	// five pull requests came from that, each one BLOCKED with nothing
	// red on it, and this job re-parked them on every pass.
	it('never refreshes a candidate itself', () => {
		expect(source).not.toContain('update-branch');
	});

	// Reporting is what nobody was doing, and the actual gap: a
	// candidate behind the integration branch will not merge on its own
	// and needs its owner to push.
	it('says which candidates are waiting on a refresh', () => {
		expect(source).toMatch(/behind\.push\(/u);
	});
});
