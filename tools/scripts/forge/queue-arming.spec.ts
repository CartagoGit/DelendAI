import { describe, expect, it } from 'vitest';

import { armingPlan, requiredChecksVerdict } from './queue-arming';

const REQUIRED = ['delendai-validate', 'CodeQL'];

describe('requiredChecksVerdict', () => {
	it('arms nothing while one required check is still running', () => {
		const verdict = requiredChecksVerdict(
			[
				{
					name: 'delendai-validate',
					status: 'in_progress',
					conclusion: null,
				},
				{ name: 'CodeQL', status: 'completed', conclusion: 'success' },
			],
			REQUIRED,
		);
		expect(verdict).toMatchObject({
			passed: false,
			pending: ['delendai-validate'],
		});
	});

	it('names a required check that never ran, and one that failed', () => {
		expect(
			requiredChecksVerdict(
				[
					{
						name: 'CodeQL',
						status: 'completed',
						conclusion: 'failure',
					},
				],
				REQUIRED,
			),
		).toMatchObject({
			passed: false,
			missing: ['delendai-validate'],
			failed: ['CodeQL'],
		});
	});

	it('passes when every required check succeeded, a rerun after a failure included', () => {
		expect(
			requiredChecksVerdict(
				[
					{
						name: 'delendai-validate',
						status: 'completed',
						conclusion: 'failure',
					},
					{
						name: 'delendai-validate',
						status: 'completed',
						conclusion: 'success',
					},
					{
						name: 'CodeQL',
						status: 'completed',
						conclusion: 'success',
					},
					{
						name: 'lint-docs',
						status: 'in_progress',
						conclusion: null,
					},
				],
				REQUIRED,
			).passed,
		).toBe(true);
	});
});

describe('armingPlan', () => {
	it('arms after a green sectioned run, with no full certification asked', () => {
		expect(armingPlan({ ready: [4, 7], riders: [4] })).toEqual({
			arm: [4, 7],
			train: false,
		});
	});

	it('runs no train of one: a lone pull request lands on its own checks', () => {
		expect(armingPlan({ ready: [], riders: [9] })).toEqual({
			arm: [],
			train: false,
		});
	});

	it('runs two or more riders as one train, which lands them', () => {
		expect(armingPlan({ ready: [4], riders: [4, 7] })).toEqual({
			arm: [],
			train: true,
		});
	});
});
