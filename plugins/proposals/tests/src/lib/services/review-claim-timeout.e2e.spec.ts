/**
 * review-claim-timeout.e2e.spec.ts — a claim commit can be reported failed and
 * still land: under load the runner's timeout fires while git is finishing.
 * What the unit carries decides what the reviewer is told.
 */
import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { claimForReview } from '@delendai/proposals/lib/services/review-claim.service';
import {
	createGitRunner,
	type IGitRunner,
} from '@delendai/proposals/lib/shared/git-runner';

/**
 * The project, built once for the file and copied per case: built per case
 * it was six git processes, and one case took 170 ms on CI against 150.
 */
const project = createGitRepoTemplate({
	trunk: 'develop',
	files: { 'README.md': '# project\n' },
});

/** A review unit one commit ahead of nothing: develop is its base. */
const unit = () => {
	const { root, git } = project.copy();
	git(
		'switch',
		'-q',
		'-c',
		'delendai/wip/agent-a/review/batch-all-g1/verdicts',
	);
	return { root, git, run: createGitRunner(root) };
};

const TIMED_OUT = {
	ok: false,
	output: '',
	reason: 'git timed out after 15000ms',
};

describe('claimForReview when git times out', () => {
	it('[<420ms] reports the claim held when the commit landed after all', async () => {
		const { git, run } = unit();
		const late: IGitRunner = async (args) => {
			const result = await run(args);
			return args[0] === 'commit' && result.ok ? TIMED_OUT : result;
		};
		const outcome = await claimForReview(
			late,
			undefined,
			'x00001',
			'develop',
		);
		expect(outcome.kind).toBe('claimed');
		expect(
			git('log', '-1', '--format=%(trailers:key=Claims,valueonly)'),
		).toBe('x00001');
	});

	it('[<150ms] reports the failure when no claim landed', async () => {
		const { run } = unit();
		const refused: IGitRunner = async (args) =>
			args[0] === 'commit' ? TIMED_OUT : run(args);
		expect(
			await claimForReview(refused, undefined, 'x00001', 'develop'),
		).toEqual({ kind: 'failed', reason: 'git timed out after 15000ms' });
	});
});
