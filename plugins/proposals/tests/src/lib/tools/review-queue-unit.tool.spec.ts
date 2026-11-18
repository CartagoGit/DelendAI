/**
 * review-queue-unit.tool.spec.ts — review_queue reads the caller's review
 * unit when it has one and enters none itself (x01032 S2).
 */
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('review_queue unit', () => {
	it('reads the caller review unit when it has one, and the checkout otherwise, writing nothing (x01032)', async () => {
		repo.proposalInReview(SLICE_S1('review'), 'x00001');
		const parent = realpathSync(mkdtempSync(join(tmpdir(), 'queue-unit-')));
		const path = join(parent, 'wt');
		repo.git(
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/agent-b/review/batch-all-g1/backlog',
			path,
			'develop',
		);
		try {
			// The unit's own tree holds a different proposal in review.
			mkdirSync(join(path, 'docs/delendai/proposals/review'), {
				recursive: true,
			});
			writeFileSync(
				join(path, 'docs/delendai/proposals/review/x00002-work.md'),
				`---\nid: x00002\ntitle: Work\nkind: fix\nstatus: review\ntype: proposal\ndate: 2026-09-02\n---\n\n# x00002 — Work\n\n## Slices\n\n${SLICE_S1('review')}`,
			);
			const idsOf = (answer: IToolAnswer): readonly string[] =>
				(
					answer.body.proposals as readonly { readonly id: string }[]
				).map((proposal) => proposal.id);
			const before = repo.git('worktree', 'list', '--porcelain');

			expect(idsOf(await queue({ agent: 'agent-b' }))).toEqual([
				'x00002',
			]);
			expect(idsOf(await queue({ agent: 'agent-c' }))).toEqual([
				'x00001',
			]);
			// Read-only: no unit was entered for the agent that had none.
			expect(repo.git('worktree', 'list', '--porcelain')).toBe(before);
		} finally {
			repo.git('worktree', 'remove', '--force', path);
			rmSync(parent, { recursive: true, force: true });
		}
	});
});
