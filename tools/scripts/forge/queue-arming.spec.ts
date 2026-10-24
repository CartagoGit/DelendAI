import { describe, expect, it } from 'vitest';

import { integrationAllowsArming, requiredChecksVerdict } from './queue-arming';

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

describe('integrationAllowsArming', () => {
	it('allows arming only on a certified integration branch', () => {
		expect(integrationAllowsArming('certified')).toBe(true);
		for (const state of ['pending', 'uncertified', 'red']) {
			expect(integrationAllowsArming(state)).toBe(false);
		}
	});
});
