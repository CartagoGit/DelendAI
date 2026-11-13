import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { followUpWorkflows } from '@delendai/core/cli';

import { readWorkflowTriggers, workflowTriggersOf } from './land-follow-ups';

describe('what land starts after it merged', () => {
	it('[<20ms] reads push, dispatch and workflow_run from a workflow', () => {
		expect(
			workflowTriggersOf(
				'ci.yml',
				'on:\n  push:\n    branches: [develop, main]\n  workflow_dispatch:\n  workflow_run:\n    workflows: [land]\n',
				'develop',
			),
		).toEqual({
			file: 'ci.yml',
			pushesIntegration: true,
			dispatchable: true,
			afterWorkflows: ['land'],
		});
		// A push with no branch filter starts on every branch.
		expect(
			workflowTriggersOf('a.yml', 'on: [push]\n', 'develop')
				.pushesIntegration,
		).toBe(true);
		expect(
			workflowTriggersOf(
				'b.yml',
				'on:\n  push:\n    branches: [main]\n',
				'develop',
			).pushesIntegration,
		).toBe(false);
	});

	it('[<20ms] starts what a push would, not what already follows land, and names what it cannot start', () => {
		expect(
			followUpWorkflows(
				[
					{
						file: 'land.yml',
						pushesIntegration: true,
						dispatchable: true,
						afterWorkflows: ['CI', 'CodeQL'],
					},
					{
						file: 'ci.yml',
						pushesIntegration: true,
						dispatchable: true,
						afterWorkflows: ['land'],
					},
					{
						file: 'codeql.yml',
						pushesIntegration: true,
						dispatchable: true,
						afterWorkflows: [],
					},
					{
						file: 'bootstrap.yml',
						pushesIntegration: true,
						dispatchable: false,
						afterWorkflows: [],
					},
					{
						file: 'release.yml',
						pushesIntegration: false,
						dispatchable: true,
						afterWorkflows: [],
					},
				],
				'land',
			),
		).toEqual({
			dispatch: ['land.yml', 'codeql.yml'],
			unreachable: ['bootstrap.yml'],
		});
	});

	it('[<200ms] starts the security scan and the next pass on this repository', () => {
		const triggers = readWorkflowTriggers(
			join(import.meta.dirname, '../../../.github/workflows'),
			'develop',
		);
		const { dispatch } = followUpWorkflows(triggers, 'land');
		expect(dispatch).toContain('codeql.yml');
		// The next pass only while land runs: integration paused has no land.yml.
		expect(dispatch.includes('land.yml')).toBe(
			existsSync(
				join(
					import.meta.dirname,
					'../../../.github/workflows/land.yml',
				),
			),
		);
		expect(dispatch).not.toContain('ci.yml');
	});
});
