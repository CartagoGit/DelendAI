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

	it('claims nothing when the review rules refuse the verdict', async () => {
		// The reviewer that asked for changes may not judge the fix. Claimed
		// before that rule ran, the proposal stayed held by the one reviewer
		// the rule had just turned away.
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review
- review-implementer: agent-a
- review-log: requested_changes by agent-b — a test is missing
- review-log: resubmitted by agent-a — the test is there
`,
		);
		repo.git('switch', '-q', '-c', REVIEW_UNIT('agent-b', 1));

		const refused = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain(
			'different agent than the previous reviewer',
		);
		expect(claimsOnHead()).toEqual([]);
	});

	it('is signed the way its unit names the agent, whatever case the call used', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));
		repo.git('switch', '-q', '-c', REVIEW_UNIT('agent-b', 1));

		const approved = await repo.review({
			action: 'approve',
			agent: 'Agent-B',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(approved.isError).toBe(false);
		// The last approval closes it: read it wherever it was filed.
		const doc = repo.git(
			'grep',
			'--untracked',
			'-h',
			'review-',
			'--',
			'docs/delendai/proposals',
		);
		expect(doc).toContain('approved by agent-b');
		expect(doc).not.toContain('Agent-B');
	});

	it('is refused when signed by another agent than the one its unit is named after', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		repo.git('switch', '-q', '-c', REVIEW_UNIT('agent-b', 1));
		const head = repo.git('rev-parse', 'HEAD');

		const refused = await repo.review({
			action: 'request_changes',
			agent: 'agent-c',
			note: 'the acceptance is not met',
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('not the reviewer of this review unit');
		expect(repo.git('rev-parse', 'HEAD')).toBe(head);
	});

	it('is refused outside a review unit, and writes nothing', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		repo.git('switch', '-q', '-c', 'somewhere-else');
		const head = repo.git('rev-parse', 'HEAD');
		const file = join(
			repo.root,
			'docs/delendai/proposals/review/x00001-work.md',
		);
		const before = readFileSync(file, 'utf8');

		const refused = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the acceptance is not met',
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain("the reviewer's own review unit");
		expect(refused.text).toContain('delendai review next');
		expect(repo.git('rev-parse', 'HEAD')).toBe(head);
		expect(readFileSync(file, 'utf8')).toBe(before);
	});
});

describe('the language of a verdict', () => {
	it('is the one the project declared, and a verdict in another writes nothing', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		const file = join(
			repo.root,
			'docs/delendai/proposals/review/x00001-work.md',
		);
		const before = readFileSync(file, 'utf8');

		const refused = await repo.review(
			{
				action: 'request_changes',
				agent: 'agent-b',
				note: 'El gate declarado no existe, falta el script en package.json',
			},
			{ documentationLanguage: 'en' },
		);
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('English');
		expect(readFileSync(file, 'utf8')).toBe(before);

		const accepted = await repo.review(
			{
				action: 'request_changes',
				agent: 'agent-b',
				note: 'The declared gate does not exist: the script is missing.',
			},
			{ documentationLanguage: 'en' },
		);
		expect(accepted.isError).toBe(false);
	});
});

describe('who signs a verdict', () => {
	it('refuses a role in place of a reviewer, however it is spelled (x00745)', async () => {
		repo.proposalInReview(SLICE_S1('review'));
		for (const agent of [
			'delivery_verifier',
			'delivery-verifier',
			'delendai-delivery-verifier',
		]) {
			const refused = await repo.review({
				action: 'approve',
				agent,
				evidence: EVIDENCE,
			});
			expect(refused.isError).toBe(true);
			expect(refused.text).toContain('is a role, not a reviewer');
		}
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
