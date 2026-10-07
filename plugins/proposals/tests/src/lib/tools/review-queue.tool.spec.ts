/**
 * review-queue.tool.spec.ts — one read tells a reviewer what the review
 * backlog needs (x00646 S3), on a real repository.
 */
import { rmSync, writeFileSync } from 'node:fs';
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

	it('offers nobody a slice a unit of their own delivered, the whole-proposal unit included', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.deliverThroughPullRequest(
			'src/b.ts',
			'delendai/pr/agent-b/x00001-all-g1/the-rest',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const [forB] = slicesOf(await queue({ agent: 'agent-b' }), 'x00001');
		expect(forB?.verdict).toBe('needs-another-reviewer');
		expect(forB?.nextAction).toContain('Your own unit of work (agent-b)');

		const [forC] = slicesOf(await queue({ agent: 'agent-c' }), 'x00001');
		expect(forC?.verdict).toBe('needs-verdict');
	});

	it('asks for no verdict on a slice given up on purpose, whoever Git names', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(
			SLICE_S1('retired — 2026-10-05. The listener already does it.'),
		);

		const [slice] = slicesOf(await queue(), 'x00001');

		expect(slice).toMatchObject({ sliceId: 'S1', verdict: 'approved' });
		expect(slice?.nextAction).toContain('Retired');
	});

	it('names the later commits that changed what a slice delivered, so a superseded delivery is not read as incomplete', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		// Another proposal changes the same file afterwards.
		writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 42;\n');
		repo.git('add', '-A');
		repo.git(
			'commit',
			'-q',
			'--no-verify',
			'-m',
			'feat: x00099 supersedes a',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const answer = await queue();
		const [slice] = slicesOf(answer, 'x00001') as readonly (ISliceView & {
			readonly changedSince?: readonly { readonly subject: string }[];
		})[];

		expect(slice?.changedSince?.map((entry) => entry.subject)).toEqual([
			'feat: x00099 supersedes a',
		]);
		expect(
			(slice as { readonly changedSinceTruncated?: boolean } | undefined)
				?.changedSinceTruncated,
		).toBeUndefined();
		expect(answer.body.procedure).toContain('judged on what it delivered');
	});

	it('cites first the later delivery of the same slice, which is what an approval must name', async () => {
		const first = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
			'feat: x00001 the work',
			'Merge pull request #7 from Owner/x00001-S1-g1',
		);
		const fix = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g2/the-fix',
			'fix: x00001 the review asked for this',
			'Merge pull request #8 from Owner/x00001-S1-g2',
		);
		const merged = repo.git('rev-parse', 'develop');
		// The slice still records the first delivery as its own.
		repo.proposalInReview(
			`${SLICE_S1('review')}- shipped-in: \`${first.slice(0, 12)}\`\n`,
		);

		const [slice] = slicesOf(await queue(), 'x00001');

		// The fix or the merge that landed it: either is what an approval
		// is accepted with, the first delivery is not.
		expect([fix, merged]).toContain(slice?.candidates[0]?.commit);
	});

	it('says when more later commits changed the slice than it lists', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		for (let round = 0; round < 12; round += 1) {
			writeFileSync(
				join(repo.root, 'src/a.ts'),
				`export const a = ${String(round)};\n`,
			);
			repo.git('add', '-A');
			repo.git(
				'commit',
				'-q',
				'--no-verify',
				'-m',
				`feat: change ${String(round)}`,
			);
		}
		repo.proposalInReview(SLICE_S1('review'));

		const [slice] = slicesOf(
			await queue(),
			'x00001',
		) as readonly (ISliceView & {
			readonly changedSince?: readonly unknown[];
			readonly changedSinceTruncated?: boolean;
		})[];

		expect(slice?.changedSince).toHaveLength(10);
		expect(slice?.changedSinceTruncated).toBe(true);
	});

	it('names nothing when no later commit touched the slice files', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		writeFileSync(join(repo.root, 'README.md'), '# other\n');
		repo.git('add', '-A');
		repo.git('commit', '-q', '--no-verify', '-m', 'docs: unrelated');
		repo.proposalInReview(SLICE_S1('review'));

		const [slice] = slicesOf(
			await queue(),
			'x00001',
		) as readonly (ISliceView & {
			readonly changedSince?: unknown;
		})[];

		expect(slice?.changedSince).toBeUndefined();
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

	it('pages the whole backlog, saying how to ask for the next page (x00717)', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00003', '2026-09-03');
		repo.proposalInReview(SLICE_S1('review'), 'x00002', '2026-09-02');
		repo.proposalInReview(SLICE_S1('review'), 'x00004', '2026-09-04');
		const ids = (answer: IToolAnswer) =>
			(answer.body.proposals as readonly { readonly id: string }[]).map(
				(proposal) => proposal.id,
			);

		const first = await queue({ limit: 2 });
		expect(first.body.page).toMatchObject({
			offset: 0,
			returned: 2,
			total: 3,
		});
		expect(String((first.body.page as { next?: string }).next)).toContain(
			'offset: 2',
		);
		const second = await queue({ limit: 2, offset: 2 });
		expect(ids(second)).toEqual(['x00004']);
		expect((second.body.page as { next?: string }).next).toBeUndefined();

		// A reviewer that names itself starts at its own point, and its
		// pages still cover the whole backlog exactly once.
		const named = [
			...ids(await queue({ limit: 2, agent: 'minimax-m3' })),
			...ids(await queue({ limit: 2, offset: 2, agent: 'minimax-m3' })),
		];
		expect([...named].sort()).toEqual(['x00002', 'x00003', 'x00004']);
		const rotations = [
			['x00002', 'x00003', 'x00004'],
			['x00003', 'x00004', 'x00002'],
			['x00004', 'x00002', 'x00003'],
		];
		expect(rotations).toContainEqual(named);
	});

	it('reads the proposals in review from their folder, with no index at all (x00732)', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00003', '2026-09-03');
		repo.proposalInReview(SLICE_S1('review'), 'x00002', '2026-09-02');
		rmSync(join(repo.root, '.cache/delendai/proposals/index.json'));

		const answer = await queue();

		expect(
			(answer.body.proposals as readonly { readonly id: string }[]).map(
				(proposal) => proposal.id,
			),
		).toEqual(['x00002', 'x00003']);
	});

	it('narrows to one proposal on request', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00002');
		repo.proposalInReview(SLICE_S1('review'), 'x00003');

		const answer = await queue({ proposalId: 'x00003' });

		expect(answer.body.totals).toMatchObject({ proposals: 1 });
	});
});
