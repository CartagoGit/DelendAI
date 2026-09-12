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
