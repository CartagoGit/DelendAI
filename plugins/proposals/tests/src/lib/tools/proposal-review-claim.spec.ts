/**
 * proposal-review-claim.spec.ts — a verdict recorded in a review unit
 * claims what it judges, and one on a proposal another unit holds is
 * refused; a verdict leaves the next heading its blank line. On a real
 * repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createReviewRepo,
	EVIDENCE,
	SLICE_S1,
	type IReviewRepo,
} from './review-repo';

let repo: IReviewRepo;
const dirs: string[] = [];

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	repo.cleanup();
});

const REVIEW_UNIT = (agent: string, generation: number): string =>
	`delendai/wip/${agent}/review/batch-all-g${String(generation)}/backlog`;

/** Another reviewer's unit, in its own worktree, holding `claims`. */
const otherUnit = (branch: string, claims: string): void => {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), 'other-unit-')));
	dirs.push(parent);
	const path = join(parent, 'wt');
	repo.git('worktree', 'add', '-q', '-b', branch, path, 'develop');
	execFileSync(
		'git',
		[
			'commit',
			'--allow-empty',
			'-q',
			'--no-verify',
			'-m',
			`chore(review): claim ${claims}`,
			'--trailer',
			`Claims: ${claims}`,
		],
		{ cwd: path },
	);
};

const claimsOnHead = (): readonly string[] =>
	repo
		.git(
			'log',
			'--format=%(trailers:key=Claims,valueonly)',
			'develop..HEAD',
		)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

describe('a verdict in a review unit', () => {
	it('claims the proposal it judges when nobody holds it', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));
		repo.git('switch', '-q', '-c', REVIEW_UNIT('agent-b', 1));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(approved.isError).toBe(false);
		expect(claimsOnHead()).toEqual(['x00001']);
	});

	it('is refused on a proposal another unit of the same model holds', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		otherUnit(REVIEW_UNIT('agent-b', 2), 'x00001');
		repo.git('switch', '-q', '-c', REVIEW_UNIT('agent-b', 1));
		const before = readFileSync(
			join(repo.root, 'docs/delendai/proposals/review/x00001-work.md'),
			'utf8',
		);

		const refused = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the acceptance is not met',
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('held by another review unit (agent-b)');
		expect(claimsOnHead()).toEqual([]);
		expect(
			readFileSync(
				join(
					repo.root,
					'docs/delendai/proposals/review/x00001-work.md',
				),
				'utf8',
			),
		).toBe(before);
	});

	it('claims nothing outside a review unit', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		const head = repo.git('rev-parse', 'HEAD');

		const answered = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the acceptance is not met',
		});

		expect(answered.isError).toBe(false);
		expect(repo.git('rev-parse', 'HEAD')).toBe(head);
	});
});

describe('the review lines a verdict writes', () => {
	it('leave the next heading its blank line', async () => {
		const path = repo.proposalInReview(
			`${SLICE_S1('review')}\n## acceptance\n\n- it works\n`,
		);

		const answered = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the acceptance is not met',
		});

		expect(answered.isError).toBe(false);
		const reopened = readFileSync(
			path.replace('/review/', '/in-progress/'),
			'utf8',
		);
		expect(reopened).toMatch(
			/opened by agent-b\n\n## acceptance\n\n- it works\n$/u,
		);
	});
});
