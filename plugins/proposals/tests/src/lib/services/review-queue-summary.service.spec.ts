/**
 * review-queue-summary.service.spec.ts — the backlog in one sentence that
 * says whether each number counts slices or proposals.
 */
import { describe, expect, it } from 'vitest';

import type { IReviewQueueProposal } from '@delendai/proposals/lib/contracts/interfaces/review-queue.interface';
import { summarizeQueue } from '@delendai/proposals/lib/services/review-queue-summary.service';

const proposal = (
	id: string,
	verdicts: readonly IReviewQueueProposal['slices'][number]['verdict'][],
	close?: string,
): IReviewQueueProposal => ({
	id,
	file: `review/${id}-a.md`,
	slices: verdicts.map((verdict, index) => ({
		sliceId: `S${String(index + 1)}`,
		title: 'the slice',
		status: 'review',
		reviewState: 'none',
		candidates: [],
		files: [],
		acceptance: [],
		nextAction: '',
		verdict,
	})),
	...(close === undefined ? {} : { close }),
});

describe('summarizeQueue', () => {
	it('names the unit of every figure', () => {
		expect(
			summarizeQueue([
				proposal('x00001', ['needs-verdict', 'needs-verdict']),
				proposal('x00002', ['blocked', 'needs-verdict']),
				proposal('x00003', ['approved'], 'close it'),
			]),
		).toBe(
			'3 proposals in review (5 slices); 3 slices need a verdict, in 2 proposals; 1 slice is blocked, in 1 proposal; 1 proposal is approved and ready to close',
		);
	});
});
