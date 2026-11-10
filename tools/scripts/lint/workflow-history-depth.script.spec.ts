/**
 * workflow-history-depth.script.spec.ts — the rule that a new workflow
 * arrives already guarded against the failure that cost this cycle a day.
 */
import { describe, expect, it } from 'vitest';

import { WAIVER_MARKER } from './workflow-history-depth.constant';
import {
	asksForHistory,
	findShallowHistoryJobs,
	historyCommandsIn,
	invokedSources,
	jobsOf,
} from './workflow-history-depth.script';

const workflow = (body: string): string =>
	['name: probe', 'on:', '    push:', 'jobs:', body].join('\n');

const job = (name: string, steps: string): string =>
	[
		`    ${name}:`,
		'        runs-on: ubuntu-latest',
		'        steps:',
		steps,
	].join('\n');

describe('workflow-history-depth (x00583)', () => {
	it('[<50ms] splits a workflow into its jobs', () => {
		const source = workflow(
			`${job('one', '            - run: echo a')}\n${job('two', '            - run: echo b')}`,
		);
		expect(jobsOf(source).map((each) => each.name)).toEqual(['one', 'two']);
	});

	it('[<90ms] refuses a job that merges on the default shallow clone', () => {
		// The exact shape that made `keep-the-queue-moving` report
		// `0 refreshed` for days, with every candidate called conflicted.
		const source = workflow(
			job(
				'merger',
				'            - uses: actions/checkout@v7\n            - run: git merge origin/develop --no-edit',
			),
		);
		const found = findShallowHistoryJobs([{ file: 'probe.yml', source }]);
		expect(found).toHaveLength(1);
		expect(found[0]?.job).toBe('merger');
	});

	it('[<50ms] accepts the same job once it asks for the history', () => {
		const source = workflow(
			job(
				'merger',
				"            - uses: actions/checkout@v7\n              with:\n                  fetch-depth: '0'\n            - run: git merge origin/develop --no-edit",
			),
		);
		expect(findShallowHistoryJobs([{ file: 'probe.yml', source }])).toEqual(
			[],
		);
	});

	it('[<50ms] follows one level into the script a job invokes', () => {
		// The rule would not have caught its own motivating example
		// otherwise: that merge ran inside the old candidate refresh, two levels
		// from the workflow.
		const source = workflow(
			job(
				'indirect',
				'            - uses: actions/checkout@v7\n            - run: bun run forge:forward-sync',
			),
		);
		const found = findShallowHistoryJobs(
			[{ file: 'probe.yml', source }],
			(name) =>
				name === 'forge:forward-sync'
					? // The argv form a real script uses.
						"run(['-c', 'core.hooksPath=/dev/null', 'merge', ref])"
					: undefined,
		);
		expect(found).toHaveLength(1);
	});

	it('[<60ms] lets a job say why shallow is enough, in writing', () => {
		const source = workflow(
			job(
				'waived',
				`            # ${WAIVER_MARKER}: only reads the tip\n            - uses: actions/checkout@v7\n            - run: git merge --abort || true`,
			),
		);
		expect(findShallowHistoryJobs([{ file: 'probe.yml', source }])).toEqual(
			[],
		);
	});

	it('[<50ms] says nothing about a job that only reads the tip', () => {
		const source = workflow(
			job(
				'plain',
				'            - uses: actions/checkout@v7\n            - run: git status --porcelain && git rev-parse HEAD',
			),
		);
		expect(findShallowHistoryJobs([{ file: 'probe.yml', source }])).toEqual(
			[],
		);
	});

	it('[<50ms] knows which commands need an ancestor and which do not', () => {
		// At least one pattern each — several may describe the same
		// command, and which of them fired is not the claim.
		for (const command of [
			'git merge origin/x',
			'git merge-base a b',
			'git diff a...b',
		]) {
			expect(
				`${command}: ${String(historyCommandsIn(command).length > 0)}`,
			).toBe(`${command}: true`);
		}
		expect(
			historyCommandsIn('git rev-list --count a..b').length,
		).toBeGreaterThan(0);
		// And the argv form, which is how the scripts here actually spell it.
		expect(
			historyCommandsIn("run(['merge', 'origin/develop'])").length,
		).toBeGreaterThan(0);
		// Fine at any depth, and a rule that fired on these would be
		// turned off within a week.
		expect(historyCommandsIn('git status')).toEqual([]);
		expect(historyCommandsIn('git rev-parse HEAD')).toEqual([]);
		expect(historyCommandsIn('git diff --name-only')).toEqual([]);
	});

	it('[<50ms] refuses a job handed the pull request base on the default shallow clone', () => {
		// `plan-tests`: the diff against the base happened two modules
		// below the script the job runs, where no command pattern reaches.
		const planner = (setup: string): string =>
			workflow(
				job(
					'plan-tests',
					`${setup}\n            - run: bun tools/scripts/ci/test-zones.script.ts --matrix --base=\${{ github.event.pull_request.base.sha || '' }}`,
				),
			);
		const shallow = planner(
			'            - uses: ./.github/actions/setup-bun-repo',
		);
		expect(
			findShallowHistoryJobs([{ file: 'ci.yml', source: shallow }]).map(
				(each) => each.job,
			),
		).toEqual(['plan-tests']);
		const deep = planner(
			"            - uses: ./.github/actions/setup-bun-repo\n              with:\n                  fetch-depth: '0'",
		);
		expect(
			findShallowHistoryJobs([{ file: 'ci.yml', source: deep }]),
		).toEqual([]);
	});

	it('[<70ms] reads a depth of zero however it is quoted', () => {
		for (const spelling of [
			'fetch-depth: 0',
			"fetch-depth: '0'",
			'fetch-depth: "0"',
		]) {
			expect(asksForHistory(spelling)).toBe(true);
		}
		expect(asksForHistory("fetch-depth: '1'")).toBe(false);
	});

	it('[<50ms] resolves both spellings of an invocation', () => {
		const seen = invokedSources(
			'run: bun run forge:forward-sync\nrun: bun tools/scripts/git/x.script.ts',
			(name) => `source-of:${name}`,
		);
		expect(seen).toEqual([
			'source-of:forge:forward-sync',
			'source-of:tools/scripts/git/x.script.ts',
		]);
	});
});
