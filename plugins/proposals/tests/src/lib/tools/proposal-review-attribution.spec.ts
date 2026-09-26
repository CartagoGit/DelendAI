/**
 * proposal-review-attribution.spec.ts — a verdict on a slice no round
 * was opened for (x00643, x00646): the implementer comes from Git, read
 * with the project's own ref shape, whatever the forge wrote.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
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

describe('a verdict on a slice no round was opened for', () => {
	it('opens the round under the agent the pull request names, then approves and closes', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(approved.isError).toBe(false);
		expect(approved.body).toMatchObject({
			status: 'done',
			implementer: 'agent-a',
			reviewer: 'agent-b',
			attributedTo: 'agent-a',
			proposalClosed: true,
		});
		const closed = join(
			repo.root,
			'docs/delendai/proposals/done/fixes/x00001-work.md',
		);
		expect(existsSync(closed)).toBe(true);
		const markdown = readFileSync(closed, 'utf8');
		expect(markdown).toMatch(/^status: done$/mu);
		expect(markdown).toContain(`- ${commit.slice(0, 9)}`);
		expect(markdown).toContain(
			'- review-attribution: agent-a from Merge pull request #7 from Owner/delendai/pr/agent-a/x00001-S1-g1/the-work (refs/heads/delendai/wip/agent-a/x00001-S1-g1/the-work)',
		);
		expect(markdown).toContain('- **Status**: done');
	});

	it('falls back to the Co-Authored-By trailer when no pull request names an agent', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/x00001-the-work',
			'feat: the work\n\nCo-Authored-By: Agent Model 7.1 <noreply@example.com>',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body).toMatchObject({
			attributedTo: 'agent-model-7-1',
		});
	});

	it("reads the unit out of another forge's merge wording", async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-g/x00001-S1-g1/the-work',
			'feat: the work',
			"Merge branch 'delendai/pr/agent-g/x00001-S1-g1/the-work' into 'develop'",
		);
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body).toMatchObject({ attributedTo: 'agent-g' });
	});

	it('attributes a squash-merged delivery from the ref its commit names', async () => {
		writeFileSync(
			join(repo.root, 'src/a.ts'),
			'export const squashed = 1;\n',
		);
		repo.git('add', 'src/a.ts');
		repo.git(
			'commit',
			'-q',
			'--no-verify',
			'-m',
			'feat: the work (#7)\n\nDelendai-Wip-Ref: refs/heads/delendai/wip/agent-s/x00001-S1-g1/the-work',
		);
		const commit = repo.git('rev-parse', 'HEAD');
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body).toMatchObject({ attributedTo: 'agent-s' });
	});

	it('reviews a delivery nobody signed as unrecorded, and says independence is unverified', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/x00001-the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body).toMatchObject({
			status: 'done',
			implementer: 'unrecorded',
			attributedTo: 'unrecorded',
		});
		const markdown = readFileSync(
			join(
				repo.root,
				'docs/delendai/proposals/done/fixes/x00001-work.md',
			),
			'utf8',
		);
		expect(markdown).toContain(
			`- review-attribution: unrecorded — nothing in Git names who delivered ${commit}`,
		);
		expect(markdown).toContain('independence could not be verified');
	});

	it('sends back a slice with no delivering commit, without inventing an implementer', async () => {
		repo.proposalInReview(SLICE_S1('review'));

		const rejected = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'nothing was delivered for S1',
		});

		expect(rejected.body).toMatchObject({
			status: 'changes_requested',
			implementer: 'unrecorded',
			proposalReopened: true,
		});
	});

	it('still refuses an approval without a commit', async () => {
		const path = repo.proposalInReview(SLICE_S1('review'));
		const before = readFileSync(path, 'utf8');

		const refused = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			note: 'ok',
		});

		expect(refused.isError).toBe(true);
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('refuses a commit that neither touches the slice nor cites the proposal', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/other.ts',
			'delendai/pr/agent-a/y00002-S1-g1/unrelated',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const refused = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain(
			"changes none of the slice's declared files",
		);
	});

	it('refuses the agent Git names as the implementer as its own reviewer', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const refused = await repo.review({
			action: 'approve',
			agent: 'agent-a',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(refused.isError).toBe(true);
		expect(refused.body.error).toMatchObject({
			reason: 'self-approve',
			nextAction: expect.stringContaining(
				'Git attributes this delivery to "agent-a"',
			),
		});
	});

	it('sends a hand-marked done slice back to work, and the proposal with it', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('done'));

		const rejected = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the guard passes when git cannot run',
			commitHash: commit,
		});

		expect(rejected.body).toMatchObject({
			status: 'changes_requested',
			attributedTo: 'agent-a',
			proposalReopened: true,
		});
		const reopened = join(
			repo.root,
			'docs/delendai/proposals/in-progress/x00001-work.md',
		);
		const markdown = readFileSync(reopened, 'utf8');
		expect(markdown).toContain('- **Status**: in-progress');
		expect(markdown).toContain(
			'- review-log: requested_changes by agent-b — the guard passes when git cannot run',
		);
	});

	it('approves a round committed in the document from a clone that never saw the submit', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review\n- review-implementer: agent-a\n`,
		);

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: 'abc1234' },
		});

		expect(approved.isError).toBe(false);
		expect(approved.body).toMatchObject({
			status: 'done',
			implementer: 'agent-a',
		});
	});
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
		repo.git('worktree', 'add', '-q', '-b', 'reviewer-unit', worktree);
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
