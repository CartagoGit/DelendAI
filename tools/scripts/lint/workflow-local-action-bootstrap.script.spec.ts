import { describe, expect, it } from 'vitest';

import { findUnbootstrappedJobs } from './workflow-local-action-bootstrap.script';

const workflow = (steps: string): string =>
	['jobs:', '    build:', '        steps:', steps].join('\n');

describe('workflow local-action bootstrap', () => {
	it('flags a job that opens with a local composite action', () => {
		// The exact shape that failed every run from 2026-08-31: the
		// composite action's own first step is a checkout, which cannot
		// help, because the action itself has to be found first.
		const findings = findUnbootstrappedJobs(
			'ci.yml',
			workflow(
				[
					'            - name: Setup repo',
					'              uses: ./.github/actions/setup-bun-repo',
					'            - name: Run tests',
					'              run: bun run test',
				].join('\n'),
			),
		);
		expect(findings).toEqual([
			{
				workflow: 'ci.yml',
				job: 'build',
				localAction: './.github/actions/setup-bun-repo',
			},
		]);
	});

	it('accepts a bare checkout placed before it', () => {
		const findings = findUnbootstrappedJobs(
			'ci.yml',
			workflow(
				[
					'            - uses: actions/checkout@v7',
					'            - name: Setup repo',
					'              uses: ./.github/actions/setup-bun-repo',
				].join('\n'),
			),
		);
		expect(findings).toEqual([]);
	});

	it('rejects a checkout that comes AFTER the local action', () => {
		// Position is the whole point: by the time this checkout runs,
		// the action has already failed to resolve. A gate that only
		// asked "does this job check out somewhere" would pass it.
		const findings = findUnbootstrappedJobs(
			'ci.yml',
			workflow(
				[
					'            - name: Setup repo',
					'              uses: ./.github/actions/setup-bun-repo',
					'            - uses: actions/checkout@v7',
				].join('\n'),
			),
		);
		expect(findings).toHaveLength(1);
	});

	it('ignores jobs that use only published actions', () => {
		const findings = findUnbootstrappedJobs(
			'release.yml',
			workflow(
				[
					'            - uses: oven-sh/setup-bun@v2',
					'            - name: Publish',
					'              run: bun run release',
				].join('\n'),
			),
		);
		expect(findings).toEqual([]);
	});

	it('says nothing about YAML it cannot parse', () => {
		expect(findUnbootstrappedJobs('broken.yml', 'jobs: [::')).toEqual([]);
	});
});
