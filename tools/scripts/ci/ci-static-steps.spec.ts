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

const workflow = (lintSecurityRun: string): string =>
	[
		'name: CI',
		'jobs:',
		...STATIC_CHECK_JOBS.flatMap((job) => [
			`    ${job}:`,
			'        runs-on: ubuntu-latest',
			'        steps:',
			'            - uses: actions/checkout@v7',
			`            - run: ${job === 'lint-security' ? lintSecurityRun : `bun run ${job}`}`,
		]),
		'',
	].join('\n');

describe('staticChecksOf', () => {
	it('reads each static job and resolves what a pull request run would', () => {
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
		expect(checks[0]?.script).toBe('bun run lint-biome');
	});

	it('refuses a step whose expression has no local meaning', () => {
		expect(() =>
			staticChecksOf(
				workflow('echo ${{ secrets.SOMETHING }}'),
				'abc',
				'develop',
			),
		).toThrow('has no local meaning');
	});

	it('refuses a workflow that lost one of the jobs', () => {
		expect(() =>
			staticChecksOf(
				'name: CI\njobs:\n    lint-biome:\n        steps: []\n',
				'a',
				'b',
			),
		).toThrow('has no `lint-architecture` job');
	});

	it('reproduces every static check of the real workflow', () => {
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
