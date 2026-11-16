/**
 * ci-static-steps.spec.ts — the local proof runs the static checks the
 * workflow runs, read from it, and refuses a check it cannot reproduce.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	RUN_ALONE,
	STATIC_CHECK_JOBS,
	staticChecksOf,
} from './ci-static-steps';
import { JOB_SCOPES } from './job-scope.constant';
import { parseWorkflowYaml } from './workflow-yaml';

const workflow = (lintSecurityRun: string): string =>
	[
		'name: CI',
		'jobs:',
		...STATIC_CHECK_JOBS.flatMap((job) => [
			`    ${job}:`,
			'        runs-on: ubuntu-latest',
			'        steps:',
			'            - uses: actions/checkout@v7',
			`            - run: ${job === 'lint-security' ? lintSecurityRun : `echo ${job}`}`,
		]),
		'',
	].join('\n');

describe('staticChecksOf', () => {
	it('[<50ms] reads each static job and resolves what a pull request run would', () => {
		const checks = staticChecksOf(
			workflow(
				"bun run lint:publication-scope -- --base=origin/${{ github.base_ref || 'develop' }} --since=${{ github.event.pull_request.base.sha || '' }}",
			),
			'abc123',
			'develop',
		);
		expect(checks.map((check) => check.job)).toEqual([
			...STATIC_CHECK_JOBS,
		]);
		expect(
			checks.find((check) => check.job === 'lint-security')?.script,
		).toBe(
			'bun run lint:publication-scope -- --base=origin/develop --since=abc123',
		);
		expect(checks[0]?.script).toBe('echo lint-biome');
	});

	it('[<50ms] refuses a step whose expression has no local meaning', () => {
		expect(() =>
			staticChecksOf(
				workflow('echo ${{ secrets.SOMETHING }}'),
				'abc',
				'develop',
			),
		).toThrow('has no local meaning');
	});

	it('[<50ms] refuses a workflow that lost one of the jobs', () => {
		expect(() =>
			staticChecksOf(
				'name: CI\njobs:\n    lint-biome:\n        steps: []\n',
				'a',
				'b',
			),
		).toThrow('has no `lint-architecture` job');
	});

	it('[<50ms] reproduces every static check of the real workflow', () => {
		const checks = staticChecksOf(
			readFileSync(
				join(import.meta.dirname, '../../../.github/workflows/ci.yml'),
				'utf8',
			),
			'abc',
			'develop',
		);
		expect(checks).toHaveLength(STATIC_CHECK_JOBS.length);
		for (const check of checks) {
			expect(check.script).not.toContain('${{');
			expect(check.script.length).toBeGreaterThan(0);
		}
		expect(
			[...RUN_ALONE].every((job) =>
				STATIC_CHECK_JOBS.includes(job as never),
			),
		).toBe(true);
	});
});

describe('a static check that is steps of a grouped job', () => {
	it('[<50ms] reads the steps gated by its plan entry', () => {
		const text = [
			'jobs:',
			...STATIC_CHECK_JOBS.filter((job) => job !== 'lint-docs').map(
				(job) =>
					`    ${job}:\n        steps:\n            - run: echo ${job}`,
			),
			'    grouped:',
			'        steps:',
			'            - name: docs',
			"              if: ${{ fromJSON(needs.plan-scope.outputs.plan)['lint-docs'] }}",
			'              run: echo grouped-docs',
		].join('\n');
		expect(
			staticChecksOf(text, 'b', 'develop').find(
				(check) => check.job === 'lint-docs',
			)?.script,
		).toBe('echo grouped-docs');
	});
});

describe('the static checks run side by side in ci.yml', () => {
	const text = readFileSync(
		join(import.meta.dirname, '../../../.github/workflows/ci.yml'),
		'utf8',
	);
	const jobs = parseWorkflowYaml(text).jobs as Record<
		string,
		{ steps?: readonly { if?: string }[]; needs?: unknown }
	>;
	const groups = JOB_SCOPES.filter(
		(scope) =>
			scope.group !== undefined && /^static-checks/u.test(scope.job),
	);

	it('[<50ms] has the three static jobs, each declared with the checks it runs', () => {
		expect(groups.map((scope) => scope.job)).toEqual([
			'static-checks',
			'static-checks-b',
			'static-checks-c',
		]);
		const members = groups.flatMap((scope) => scope.group ?? []);
		expect(new Set(members).size).toBe(members.length);
	});

	it('[<50ms] gates every check in exactly one static job, the one that declares it', () => {
		for (const group of groups) {
			for (const member of group.group ?? []) {
				const holders = Object.entries(jobs)
					.filter(([, job]) =>
						(job.steps ?? []).some((step) =>
							String(step.if ?? '').includes(`['${member}']`),
						),
					)
					.map(([name]) => name);
				expect(holders, member).toEqual([group.job]);
			}
		}
	});

	it('[<50ms] makes delendai-validate wait for all three, so none can be skipped into success', () => {
		const needs = jobs['delendai-validate']?.needs as readonly string[];
		for (const group of groups) expect(needs).toContain(group.job);
	});
});
