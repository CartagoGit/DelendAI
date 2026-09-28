/**
 * review-queue-swarm.tool.spec.ts — reviewers working at once see each
 * other's claims (x00646), on a real repository.
 */
import { join } from 'node:path';

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
	(await captureHandler(buildReviewQueueRegistration(repo.options())))({
		detail: true,
		...args,
	});

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe('a swarm of reviewers', () => {
	interface IClaimView {
		readonly id: string;
		readonly claimedBy?: readonly string[];
		readonly claim?: string;
	}
	const proposalsOf = (answer: IToolAnswer): readonly IClaimView[] =>
		answer.body.proposals as readonly IClaimView[];
	// A claim with work of its own: a commit the integration branch
	// does not hold yet.
	const hold = (ref: string): void => {
		const commit = repo.git(
			'commit-tree',
			'HEAD^{tree}',
			'-p',
			'HEAD',
			'-m',
			'a verdict',
		);
		repo.git('update-ref', ref, commit);
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
			'work enter --kind=review --proposal=batch --slice=all --agent=glm',
		);
		expect(proposals[0]?.claim).toContain('--trailer "Claims: x00003"');
		// A claim is an ordinary commit: its message must pass the
		// project's own commit rules (conventional commits here).
		expect(proposals[0]?.claim).toContain(
			'-m "chore(review): claim x00003"',
		);
		expect(answer.body.totals).toMatchObject({ claimedByOthers: 1 });
		expect(answer.body.procedure).toContain('claim it');
	});

	it("does not count a reviewer's own claim against it", async () => {
		hold('refs/heads/delendai/wip/qwen/x00002-review-g1/work');

		const proposals = proposalsOf(await queue({ agent: 'qwen' }));

		// Free proposals are rotated per reviewer (x00717), so the order
		// is not the point: its own claim must not hold x00002 from it.
		expect(proposals.map((proposal) => proposal.id).sort()).toEqual([
			'x00002',
			'x00003',
		]);
		expect(
			proposals.find((proposal) => proposal.id === 'x00002')?.claimedBy,
		).toBeUndefined();
	});

	it('keeps a proposal held while its published review waits to merge', async () => {
		hold('refs/remotes/origin/delendai/pr/qwen/x00003-close-g1/work');

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.find((proposal) => proposal.id === 'x00003')?.claimedBy,
		).toEqual(['qwen']);
	});

	it('counts a unit entered in a worktree before its first commit', async () => {
		const dir = join(repo.root, '.wt-x00002-review');
		repo.git(
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/qwen/x00002-review-g1/work',
			dir,
			'HEAD',
		);

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.find((proposal) => proposal.id === 'x00002')?.claimedBy,
		).toEqual(['qwen']);
	});

	it('frees a proposal whose review the integration branch already holds', async () => {
		// Left behind after the verdicts merged: a spent publication ref
		// and a local copy nobody deleted, both at a merged commit.
		repo.git(
			'update-ref',
			'refs/remotes/origin/delendai/pr/qwen/x00002-review-g1/work',
			'HEAD',
		);
		repo.git(
			'update-ref',
			'refs/heads/delendai/wip/qwen/x00002-review-g1/work',
			'HEAD',
		);

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.every((proposal) => proposal.claimedBy === undefined),
		).toBe(true);
	});

	it('reads what a review batch claimed from its own commits (f00644)', async () => {
		const claim = repo.git(
			'commit-tree',
			'HEAD^{tree}',
			'-p',
			'HEAD',
			'-m',
			'chore(review): claim x00002\n\nClaims: x00002',
		);
		repo.git(
			'update-ref',
			'refs/heads/delendai/wip/qwen/review/batch-all-g1/sweep',
			claim,
		);

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.find((proposal) => proposal.id === 'x00002')?.claimedBy,
		).toEqual(['qwen']);
		expect(
			proposals.find((proposal) => proposal.id === 'x00003')?.claimedBy,
		).toBeUndefined();
	});

	it('does not read an implementation unit as a review claim', async () => {
		hold('refs/heads/delendai/wip/qwen/x00002-S1-g1/the-work');

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.every((proposal) => proposal.claimedBy === undefined),
		).toBe(true);
	});
});
