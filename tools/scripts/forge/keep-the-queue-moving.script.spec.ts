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

import {
	armable,
	type IPullRequest,
	type IWorkflowRun,
	parkedRuns,
} from './keep-the-queue-moving.script';

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

	// x00557: a stuck queue reported success. Run #216 was green while
	// every candidate sat behind the integration branch, so the one part
	// of a run anybody reads at a glance said the opposite of the truth.
	it('ends red when the queue is stuck', () => {
		expect(source).toMatch(/process\.exitCode\s*=\s*1/u);
		expect(source).toMatch(/stuckExit\(behind\.length, failing\.length\)/u);
	});

	it('stays green when nothing is behind and nothing is red', () => {
		expect(source).toMatch(/if \(behind === 0 && red === 0\) return;/u);
	});
});

describe('the workflow and the script agree (x00557)', () => {
	const workflow = readFileSync(
		join(
			__dirname,
			'..',
			'..',
			'..',
			'.github',
			'workflows',
			'keep-the-queue-moving.yml',
		),
		'utf8',
	);

	// The workflow said "the merge itself refreshes the rest" and passed
	// `--apply` long after the script stopped refreshing anything. A
	// promise a job cannot keep is worse than no promise: it is what made
	// a green run mean "the queue is moving".
	//
	// Stated as "not on THIS script's line" rather than "nowhere in the
	// file". The blunt version was true only while this script was the
	// only command here; the moment the job gained steps that DO read
	// `--apply` — `forge:refresh`, `forge:artifacts` — it began failing
	// for a correct workflow, which is a test asserting something it was
	// never trying to say.
	it('does not pass a flag the script does not read', () => {
		const ours = workflow
			.split('\n')
			.filter((line) => line.includes('keep-the-queue-moving.script.ts'));
		expect(ours.length).toBeGreaterThan(0);
		for (const line of ours) expect(line).not.toContain('--apply');
	});

	it('does not claim to refresh candidates', () => {
		expect(workflow).not.toMatch(/merge itself refreshes/u);
	});
});

describe('a candidate arms itself (x00575)', () => {
	const pull = (over: Partial<IPullRequest> = {}): IPullRequest => ({
		number: 1,
		title: 'a candidate',
		auto_merge: null,
		head: { sha: 'abc', ref: 'delendai/pr/claude-opus-5/x1-S1-g1/t' },
		...over,
	});

	it('arms a candidate this model produced', () => {
		expect(armable([pull()], 'delendai/pr/')).toHaveLength(1);
	});

	it('leaves one that is already armed alone', () => {
		expect(
			armable(
				[pull({ auto_merge: { merge_method: 'merge' } })],
				'delendai/pr/',
			),
		).toHaveLength(0);
	});

	it('never speaks for a pull request from outside the namespace', () => {
		// Somebody else's branch is somebody else's decision.
		expect(
			armable(
				[pull({ head: { sha: 'a', ref: 'feature/theirs' } })],
				'delendai/pr/',
			),
		).toHaveLength(0);
	});

	it('leaves a draft alone, because a draft says it is not ready', () => {
		expect(armable([pull({ draft: true })], 'delendai/pr/')).toHaveLength(
			0,
		);
	});

	it('follows the namespace the project configured, not a hard-coded one', () => {
		const theirs = pull({
			head: { sha: 'a', ref: 'acme/pr/claude-opus-5/x1-S1-g1/t' },
		});
		expect(armable([theirs], 'acme/pr/')).toHaveLength(1);
		expect(armable([theirs], 'delendai/pr/')).toHaveLength(0);
	});
});
