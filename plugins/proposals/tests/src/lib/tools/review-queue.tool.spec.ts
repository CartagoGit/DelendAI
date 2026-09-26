/**
 * review-queue.tool.spec.ts — one read tells a reviewer what the review
 * backlog needs (x00646 S3), on a real repository.
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

const queue = async (
	args: Record<string, unknown> = {},
): Promise<IToolAnswer> =>
	(await captureHandler(buildReviewQueueRegistration(repo.options())))(args);

interface ISliceView {
	readonly sliceId: string;
	readonly verdict: string;
	readonly implementer?: string;
	readonly implementerSource?: string;
	readonly candidates: readonly { readonly commit: string }[];
	readonly nextAction: string;
	readonly missing?: string;
}

const slicesOf = (answer: IToolAnswer, id: string): readonly ISliceView[] =>
	(
		answer.body.proposals as readonly {
			readonly id: string;
			readonly slices: readonly ISliceView[];
		}[]
	).find((proposal) => proposal.id === id)?.slices ?? [];

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe('review_queue', () => {
	it('finds the delivery of a slice no round was opened for, and names who delivered it', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const [slice] = slicesOf(await queue(), 'x00001');

		expect(slice).toMatchObject({
			sliceId: 'S1',
			verdict: 'needs-verdict',
			implementer: 'agent-a',
			implementerSource: 'git',
		});
		expect(slice?.candidates[0]?.commit).toBe(commit);
		expect(slice?.nextAction).toContain(`commitHash: "${commit}"`);
		expect(slice?.nextAction).toContain('<you — not agent-a>');
	});

	it('puts a delivery nobody signed up for a verdict, as unrecorded', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/x00001-the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const [slice] = slicesOf(await queue(), 'x00001');

		expect(slice).toMatchObject({
			verdict: 'needs-verdict',
			implementer: 'unrecorded',
			implementerSource: 'unrecorded',
		});
		expect(slice?.nextAction).toContain('independence cannot be verified');
	});

	it('reads the implementer of an open round from the round', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review\n- review-implementer: agent-r\n`,
		);

		const [slice] = slicesOf(await queue(), 'x00001');

		expect(slice).toMatchObject({
			verdict: 'needs-verdict',
			implementer: 'agent-r',
			implementerSource: 'round',
		});
	});

	it('reports a slice nothing delivered as blocked, with the missing datum', async () => {
		repo.proposalInReview(SLICE_S1('review'));

		const [slice] = slicesOf(await queue(), 'x00001');

		expect(slice?.verdict).toBe('blocked');
		expect(slice?.missing).toContain('the commit that delivered x00001 S1');
		expect(slice?.nextAction).toContain(
			"Do not submit on the implementer's behalf",
		);
	});

	it('names the close of a proposal whose slices are all approved', async () => {
		repo.proposalInReview(
			`${SLICE_S1('done')}- review-state: done\n- review-implementer: agent-a\n- review-log: approved by agent-b\n`,
		);

		const answer = await queue();
		const [proposal] = answer.body.proposals as readonly {
			readonly close?: string;
		}[];

		expect(proposal?.close).toContain(
			'proposals_proposal_transition { id: "x00001", to: "done"',
		);
		expect(answer.body.totals).toMatchObject({ readyToClose: 1 });
	});

	it('orders the backlog oldest first, pages it, and counts all of it', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00003', '2026-09-03');
		repo.proposalInReview(SLICE_S1('review'), 'x00002', '2026-09-02');
		repo.proposalInReview(SLICE_S1('review'), 'x00004', '2026-09-04');

		const answer = await queue({ limit: 2 });

		expect(
			(answer.body.proposals as readonly { readonly id: string }[]).map(
				(proposal) => proposal.id,
			),
		).toEqual(['x00002', 'x00003']);
		expect(answer.body.totals).toMatchObject({ proposals: 3, blocked: 3 });
		expect(answer.body.procedure).toContain('Never edit code');
	});

	it('narrows to one proposal on request', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00002');
		repo.proposalInReview(SLICE_S1('review'), 'x00003');

		const answer = await queue({ proposalId: 'x00003' });

		expect(answer.body.totals).toMatchObject({ proposals: 1 });
	});

	describe('a swarm of reviewers', () => {
		interface IClaimView {
			readonly id: string;
			readonly claimedBy?: readonly string[];
			readonly claim?: string;
		}
		const proposalsOf = (answer: IToolAnswer): readonly IClaimView[] =>
			answer.body.proposals as readonly IClaimView[];
		const hold = (ref: string): void => {
			repo.git('update-ref', ref, 'HEAD');
		};

		beforeEach(() => {
			repo.proposalInReview(SLICE_S1('review'), 'x00002', '2026-09-02');
			repo.proposalInReview(SLICE_S1('review'), 'x00003', '2026-09-03');
		});

		it('lists a proposal another reviewer holds last, names who, and offers the rest a claim', async () => {
			hold('refs/heads/delendai/wip/qwen/x00002-review-g1/work');

			const answer = await queue({ agent: 'glm' });
			const proposals = proposalsOf(answer);

			expect(proposals.map((proposal) => proposal.id)).toEqual([
				'x00003',
				'x00002',
			]);
			expect(proposals[1]?.claimedBy).toEqual(['qwen']);
			expect(proposals[1]?.claim).toBeUndefined();
			expect(proposals[0]?.claim).toContain(
				'work enter --proposal=x00003 --slice=review --agent=glm',
			);
			expect(answer.body.totals).toMatchObject({ claimedByOthers: 1 });
			expect(answer.body.procedure).toContain('claim it');
		});

		it("does not count a reviewer's own claim against it", async () => {
			hold('refs/heads/delendai/wip/qwen/x00002-review-g1/work');

			const proposals = proposalsOf(await queue({ agent: 'qwen' }));

			expect(proposals.map((proposal) => proposal.id)).toEqual([
				'x00002',
				'x00003',
			]);
			expect(proposals[0]?.claimedBy).toBeUndefined();
		});

		it('keeps a proposal held while its published review waits to merge', async () => {
			hold('refs/remotes/origin/delendai/pr/qwen/x00003-close-g1/work');

			const proposals = proposalsOf(await queue({ agent: 'glm' }));

			expect(
				proposals.find((proposal) => proposal.id === 'x00003')
					?.claimedBy,
			).toEqual(['qwen']);
		});

		it('does not read an implementation unit as a review claim', async () => {
			hold('refs/heads/delendai/wip/qwen/x00002-S1-g1/the-work');

			const proposals = proposalsOf(await queue({ agent: 'glm' }));

			expect(
				proposals.every((proposal) => proposal.claimedBy === undefined),
			).toBe(true);
		});
	});
});
