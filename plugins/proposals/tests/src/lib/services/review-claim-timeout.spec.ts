/**
 * review-claim-timeout.spec.ts — a claim commit can be reported failed and
 * still land: under load the runner's timeout fires while git is finishing.
 * What the unit carries decides what the reviewer is told.
 *
 * The unit is a runner that keeps its commits in memory: the timeout is the
 * answer the runner gives, so nothing waits for a clock, and no git process
 * is spawned, whose time depends on the machine's load.
 */
import { describe, expect, it } from 'vitest';

import { claimForReview } from '@delendai/proposals/lib/services/review-claim.service';
import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/proposals/lib/shared/git-runner';

const TIMED_OUT: IGitRunResult = {
	ok: false,
	output: '',
	reason: 'git timed out after 15000ms',
};

/**
 * A review unit with no commits of its own. A claim commit is kept as the
 * `Claims` trailer the unit's log reports; it always answers as timed out,
 * and lands or not as `landed` says.
 */
const unit = (landed: boolean) => {
	const claims: string[] = [];
	const run: IGitRunner = async (args) => {
		if (args[0] === 'commit') {
			const trailer = args[args.indexOf('--trailer') + 1] ?? '';
			if (landed) claims.push(trailer.split(': ')[1] ?? '');
			return TIMED_OUT;
		}
		if (args[0] === 'log')
			return {
				ok: true,
				output: claims.map((id) => `${id}\t`).join('\n'),
			};
		return { ok: true, output: args[0] === 'rev-parse' ? 'abc123' : '' };
	};
	return { claims, run };
};

describe('claimForReview when git times out', () => {
	it('[<35ms] reports the claim held when the commit landed after all', async () => {
		const { claims, run } = unit(true);
		const outcome = await claimForReview(
			run,
			undefined,
			'x00001',
			'develop',
		);
		expect(outcome.kind).toBe('claimed');
		expect(claims).toEqual(['x00001']);
	});

	it('[<35ms] reports the failure when no claim landed', async () => {
		const { run } = unit(false);
		expect(
			await claimForReview(run, undefined, 'x00001', 'develop'),
		).toEqual({ kind: 'failed', reason: 'git timed out after 15000ms' });
	});
});
