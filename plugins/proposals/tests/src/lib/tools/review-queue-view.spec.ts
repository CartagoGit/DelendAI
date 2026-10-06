/**
 * review-queue-view.spec.ts — the queue is a list to choose from, and the
 * evidence comes for the proposal asked for (x00673).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildReviewQueueRegistration } from '@delendai/proposals/lib/tools/review-queue.tool';

import {
	captureHandler,
	createReviewRepo,
	SLICE_S1,
	type IReviewRepo,
	type IToolAnswer,
} from './review-repo';

let repo: IReviewRepo;

const list = async (args: Record<string, unknown> = {}): Promise<IToolAnswer> =>
	(await captureHandler(buildReviewQueueRegistration(repo.options())))(args);

const slicesOf = (
	answer: IToolAnswer,
	id: string,
): readonly Record<string, unknown>[] =>
	(
		answer.body.proposals as readonly {
			readonly id: string;
			readonly slices: readonly Record<string, unknown>[];
		}[]
	).find((proposal) => proposal.id === id)?.slices ?? [];

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe('review_queue view', () => {
	it('lists each slice\u2019s state, and keeps the evidence for the proposal asked for (x00673)', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const [listed] = slicesOf(await list(), 'x00001');
		expect(listed).toMatchObject({
			sliceId: 'S1',
			verdict: 'needs-verdict',
		});
		for (const heavy of [
			'candidates',
			'files',
			'acceptance',
			'nextAction',
			'changedSince',
		]) {
			expect(listed).not.toHaveProperty(heavy);
		}

		const [asked] = slicesOf(
			await list({ proposalId: 'x00001' }),
			'x00001',
		);
		expect(asked?.candidates).toHaveLength(1);
		expect(String(asked?.nextAction)).toContain('commitHash');
		expect((await list()).body.procedure).toContain('proposalId');
	});
});
