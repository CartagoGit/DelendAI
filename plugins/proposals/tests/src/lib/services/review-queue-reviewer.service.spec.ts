/**
 * review-queue-reviewer.service.spec.ts — the queue offers a reviewer no
 * work it cannot judge.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IReviewQueue,
	IReviewQueueSlice,
} from '../../../../src/lib/contracts/interfaces/review-queue.interface';
import { queueForReviewer } from '../../../../src/lib/services/review-queue-reviewer.service';

const slice = (
	sliceId: string,
	implementer: string | undefined,
	more: Partial<IReviewQueueSlice> = {},
): IReviewQueueSlice =>
	fakePartial<IReviewQueueSlice>({
		sliceId,
		verdict: 'needs-verdict',
		nextAction: 'approve it',
		...(implementer === undefined
			? {}
			: { implementer, implementerSource: 'round' }),
		...more,
	});

const queue = (slices: readonly IReviewQueueSlice[]): IReviewQueue =>
	fakePartial<IReviewQueue>({
		proposals: [
			fakePartial<IReviewQueue['proposals'][number]>({
				id: 'x00001',
				slices,
			}),
		],
		totals: fakePartial<IReviewQueue['totals']>({
			needsVerdict: slices.filter(
				(each) => each.verdict === 'needs-verdict',
			).length,
		}),
	});

const verdicts = (view: IReviewQueue): readonly string[] =>
	view.proposals.flatMap((proposal) =>
		proposal.slices.map((each) => each.verdict),
	);

describe('queueForReviewer', () => {
	const mixed = queue([
		slice('S1', 'model-a-9'),
		slice('S2', 'model-b-2'),
		slice('S3', 'model-a-9', { verdict: 'approved' }),
		slice('S4', 'model-a-9', { implementerSource: 'unrecorded' }),
	]);

	it('leaves to another reviewer what the asker’s own model delivered, and counts it out', () => {
		const view = queueForReviewer(mixed, 'model-a-9', 'model');
		expect(verdicts(view)).toEqual([
			'needs-another-reviewer',
			'needs-verdict',
			'approved',
			'needs-verdict',
		]);
		expect(view.totals.needsVerdict).toBe(2);
		expect(view.proposals[0]?.slices[0]?.nextAction).toContain(
			'asks for another model',
		);
	});

	it('takes two spellings of one model for the same model', () => {
		expect(verdicts(queueForReviewer(mixed, 'Model_A9', 'model'))[0]).toBe(
			'needs-another-reviewer',
		);
	});

	it('changes nothing for another model, for nobody, or where an instance may review', () => {
		expect(queueForReviewer(mixed, 'model-c-1', 'model')).toBe(mixed);
		expect(queueForReviewer(mixed, undefined, 'model')).toBe(mixed);
		expect(queueForReviewer(mixed, 'model-a-9', 'instance')).toBe(mixed);
		expect(queueForReviewer(mixed, 'model-a-9', undefined)).toBe(mixed);
	});
});
