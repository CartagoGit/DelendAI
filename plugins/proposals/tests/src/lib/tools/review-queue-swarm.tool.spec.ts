/**
 * review-queue-swarm.tool.spec.ts — reviewers working at once see each
 * other's claims (x00646), on a real repository.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
		// A claim is made with the tool, which commits it the one way: no
		// reviewer is told to type a git command.
		expect(proposals[0]?.claim).toContain(
			'proposals_review_claim { proposalId: "x00003", agent: "glm"',
		);
		expect(proposals[0]?.claim).not.toContain('git commit');
		expect(answer.body.totals).toMatchObject({ claimedByOthers: 1 });
		expect(answer.body.procedure).toContain('claim it');
	});

	it('counts the claim of another instance of the same model, and not its own unit (x00739)', async () => {
		hold('refs/heads/delendai/wip/qwen/x00002-review-g1/work');

		const sibling = proposalsOf(
			await queue({
				agent: 'qwen',
				unit: 'refs/heads/delendai/wip/qwen/x00003-review-g2/work',
			}),
		);
		const holder = proposalsOf(
			await queue({
				agent: 'qwen',
				unit: 'delendai/pr/qwen/x00002-review-g1/work',
			}),
		);

		expect(
			sibling.find((proposal) => proposal.id === 'x00002')?.claimedBy,
		).toEqual(['qwen']);
		expect(
			holder.find((proposal) => proposal.id === 'x00002')?.claimedBy,
		).toBeUndefined();
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

	it('tells a unit how full its pack is, and to publish it once full', async () => {
		const unit = 'refs/heads/delendai/wip/qwen/review/batch-all-g1/sweep';
		let tip = repo.git('rev-parse', 'HEAD');
		const claimAll = (ids: readonly string[]): void => {
			for (const id of ids) {
				tip = repo.git(
					'commit-tree',
					'HEAD^{tree}',
					'-p',
					tip,
					'-m',
					`chore(review): claim ${id}\n\nClaims: ${id}`,
				);
			}
			repo.git('update-ref', unit, tip);
		};

		claimAll(['x00002', 'x00003']);
		const partly = (await queue({ agent: 'qwen', unit })).body.pack;
		claimAll(['x00004', 'x00005', 'x00006']);
		const full = (await queue({ agent: 'qwen', unit })).body.pack;
		const unnamed = (await queue({ agent: 'qwen' })).body.pack;

		expect(partly).toEqual({ size: 5, claimed: 2, full: false });
		expect(full).toMatchObject({ size: 5, claimed: 5, full: true });
		expect(String((full as { next?: string }).next)).toContain('publish');
		expect(unnamed).toBeUndefined();
	});

	it('does not read an implementation unit as a review claim', async () => {
		hold('refs/heads/delendai/wip/qwen/x00002-S1-g1/the-work');

		const proposals = proposalsOf(await queue({ agent: 'glm' }));

		expect(
			proposals.every((proposal) => proposal.claimedBy === undefined),
		).toBe(true);
	});

	it('reads the queue from the reviewer’s own unit, where its verdicts are', async () => {
		const unit = 'refs/heads/delendai/wip/qwen/review/batch-all-g1/sweep';
		const worktree = join(repo.root, '.cache', 'unit');
		repo.git('add', '-A');
		repo.git('commit', '-q', '-m', 'proposals in review');
		repo.git(
			'worktree',
			'add',
			'-q',
			'-b',
			unit.slice('refs/heads/'.length),
			worktree,
		);
		const inUnit = join(
			worktree,
			'docs/delendai/proposals/review/x00002-work.md',
		);
		writeFileSync(
			inUnit,
			readFileSync(inUnit, 'utf8').replace(
				'- **Status**: review',
				'- **Status**: review\n- review-state: done\n- review-implementer: glm',
			),
		);

		const seen = (answer: IToolAnswer) =>
			(
				answer.body.proposals as {
					id: string;
					slices: { verdict: string }[];
				}[]
			)
				.find((proposal) => proposal.id === 'x00002')
				?.slices.map((slice) => slice.verdict);

		expect(seen(await queue({ agent: 'qwen' }))).not.toEqual(['approved']);
		expect(seen(await queue({ agent: 'qwen', unit }))).toEqual([
			'approved',
		]);
	});
});
