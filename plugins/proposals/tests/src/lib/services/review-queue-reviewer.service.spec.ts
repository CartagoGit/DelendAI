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

	it('leaves to another reviewer a slice the asker delivered under another submitter', () => {
		// The round names the agent that submitted; the asker's own unit
		// delivered part of it too, so it is one of its implementers.
		const coAuthored = queue([
			slice('S1', 'model-b-2', {
				candidates: [
					{
						commit: 'a1',
						source: 'merge (pr/model-b-2/x00001-S1-g1/one)',
						agent: 'model-b-2',
					},
					{
						commit: 'b2',
						source: 'merge (pr/model-a-9/x00001-S1-g2/two)',
						agent: 'model-a-9',
					},
				],
			}),
			slice('S2', 'model-b-2', {
				candidates: [
					{ commit: 'c3', source: 'merge', agent: 'model-b-2' },
				],
			}),
		]);
		for (const independence of ['model', 'instance'] as const) {
			const view = queueForReviewer(
				coAuthored,
				'model-a-9',
				independence,
			);
			expect(verdicts(view)).toEqual([
				'needs-another-reviewer',
				'needs-verdict',
			]);
			expect(view.totals.needsVerdict).toBe(1);
			expect(view.proposals[0]?.slices[0]?.nextAction).toContain(
				'Your own unit of work (model-a-9)',
			);
		}
		// Another instance of the same model did not deliver it.
		expect(
			queueForReviewer(coAuthored, 'model-a-9-other', 'instance'),
		).toBe(coAuthored);
	});
});
