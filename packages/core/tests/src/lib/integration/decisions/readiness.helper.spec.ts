/**
 * readiness.spec.ts — a pull request is ready when it is not a draft, its
 * required checks are green on its head and no label blocks it.
 */
import { describe, expect, it } from 'vitest';

import {
	pullRequestReady,
	whyNotReady,
} from '@delendai/core/lib/integration/decisions/readiness.helper';
import type { IPullRequestChecks } from '@delendai/core/lib/integration/decisions/readiness.interface';

const base: IPullRequestChecks = {
	draft: false,
	checks: [
		{ name: 'delendai-validate', conclusion: 'success' },
		{ name: 'CodeQL', conclusion: 'success' },
	],
	required: ['delendai-validate', 'CodeQL'],
	withoutChecks: false,
	labels: [],
	unbuiltAuthors: ['github-actions[bot]'],
	blockingLabels: ['needs update'],
};

describe('pullRequestReady', () => {
	it('[<5ms] is ready when every required check is green', () => {
		expect(pullRequestReady(base)).toBe(true);
	});

	it('[<5ms] a draft is not ready', () => {
		expect(pullRequestReady({ ...base, draft: true })).toBe(false);
	});

	it('[<5ms] a required check that is red, pending or missing is not green', () => {
		expect(
			pullRequestReady({
				...base,
				checks: [{ name: 'delendai-validate', conclusion: 'failure' }],
			}),
		).toBe(false);
		expect(
			pullRequestReady({
				...base,
				checks: [
					{ name: 'delendai-validate', conclusion: 'success' },
					{ name: 'CodeQL', conclusion: null },
				],
			}),
		).toBe(false);
		expect(pullRequestReady({ ...base, checks: [] })).toBe(false);
	});

	it('[<5ms] a blocking label keeps it out; another label does not', () => {
		expect(pullRequestReady({ ...base, labels: ['needs update'] })).toBe(
			false,
		);
		expect(pullRequestReady({ ...base, labels: ['docs'] })).toBe(true);
	});

	it('[<5ms] no required check is not green unless the policy opts in', () => {
		expect(pullRequestReady({ ...base, required: [] })).toBe(false);
		expect(
			pullRequestReady({ ...base, required: [], withoutChecks: true }),
		).toBe(true);
	});

	it('[<5ms] is deterministic for the same facts', () => {
		expect(pullRequestReady(base)).toBe(pullRequestReady({ ...base }));
	});

	it('[<5ms] a head the workflow token pushed is not ready while no check reports on it, and says why', () => {
		const bot = { ...base, headAuthor: 'github-actions[bot]', checks: [] };
		expect(pullRequestReady(bot)).toBe(false);
		expect(whyNotReady(bot)).toContain('whose pushes start no CI');
		expect(
			pullRequestReady({ ...base, headAuthor: 'github-actions[bot]' }),
		).toBe(true);
		expect(pullRequestReady({ ...base, headAuthor: 'someone' })).toBe(true);
	});

	it('[<5ms] names what it waits for, and what did not pass', () => {
		expect(whyNotReady({ ...base, checks: [] })).toBe(
			'waiting for delendai-validate, CodeQL',
		);
		expect(
			whyNotReady({
				...base,
				checks: [
					{ name: 'delendai-validate', conclusion: 'failure' },
					{ name: 'CodeQL', conclusion: 'success' },
				],
			}),
		).toBe('delendai-validate did not pass');
		expect(whyNotReady(base)).toBeUndefined();
	});
});
