/**
 * review-claim.service.spec.ts — a revalidation batch is a review-kind unit
 * that is not a reviewer's pack: no verdict is signed in it.
 */
import { describe, expect, it } from 'vitest';

import {
	inReviewUnit,
	reviewUnitAgent,
} from '@delendai/proposals/lib/services/review-claim.service';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const SHAPE = {
	workRefTemplate:
		'heads/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}', // work-ref-shape: alternative
	workRefPrefix: 'heads/wip/',
	publicationRefPrefix: 'pr/',
};

const on =
	(branch: string): IGitRunner =>
	async () => ({
		ok: true,
		output: `refs/heads/${branch}\n`,
	});

describe('the unit a checkout is on', () => {
	it('[<20ms] reads a reviewer pack as a review unit signed by its reviewer', async () => {
		const run = on('wip/gpt-6/review/batch-all-g1/verdicts');
		expect(await inReviewUnit(run, SHAPE)).toBe(true);
		expect(await reviewUnitAgent(run, SHAPE)).toBe('gpt-6');
	});

	it('[<20ms] does not read a revalidation batch as a review pack', async () => {
		const run = on('wip/gpt-6/review/batch-all-g1/revalidation');
		expect(await inReviewUnit(run, SHAPE)).toBe(false);
		expect(await reviewUnitAgent(run, SHAPE)).toBeUndefined();
	});
});
