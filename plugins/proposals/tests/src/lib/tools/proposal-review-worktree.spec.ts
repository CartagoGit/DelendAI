/**
 * proposal-review-worktree.spec.ts — a verdict recorded from the
 * reviewer's own worktree is journalled in the repository, not in the
 * worktree.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runInExecutionRoot } from '@delendai/core/lib/shared/execution-root';
import { PEER_REVIEW_LOG_RELATIVE_PATH } from '@delendai/proposals/lib/contracts/constants/proposal-paths.constant';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createReviewRepo,
	EVIDENCE,
	SLICE_S1,
	type IReviewRepo,
} from './review-repo';

let repo: IReviewRepo;

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe("a verdict recorded from a reviewer's own worktree", () => {
	it("lands in the repository's peer-review journal, not in the worktree", async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));
		repo.git('add', '-A', 'docs');
		repo.git('commit', '-q', '--no-verify', '-m', 'proposal in review');
		const worktree = join(repo.root, '.worktrees', 'x00001-review');
		repo.git(
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/agent-b/review/batch-all-g1/backlog',
			worktree,
		);
		mkdirSync(join(worktree, '.cache/delendai/proposals'), {
			recursive: true,
		});
		copyFileSync(
			join(repo.root, '.cache/delendai/proposals/index.json'),
			join(worktree, '.cache/delendai/proposals/index.json'),
		);

		const approved = await runInExecutionRoot(worktree, () =>
			repo.review({
				action: 'approve',
				agent: 'agent-b',
				evidence: { ...EVIDENCE, commitHash: commit },
			}),
		);

		expect(approved.isError).toBe(false);
		expect(
			readFileSync(
				join(repo.root, PEER_REVIEW_LOG_RELATIVE_PATH),
				'utf8',
			),
		).toContain('agent-b');
		expect(existsSync(join(worktree, PEER_REVIEW_LOG_RELATIVE_PATH))).toBe(
			false,
		);
	});
});
