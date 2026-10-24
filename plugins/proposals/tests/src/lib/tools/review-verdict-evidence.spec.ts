/**
 * review-verdict-evidence.spec.ts — a verdict names what it judged, where
 * a reader of the proposal can check it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	approvalNote,
	recordedRun,
	staleApprovals,
} from '@delendai/proposals/lib/services/review-verdict-evidence';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';

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

/** Deliver `src/a.ts` on develop under a commit that names the proposal. */
const deliver = (): string => {
	writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 1;\n');
	repo.git('add', 'src/a.ts');
	repo.git('commit', '-q', '--no-verify', '-m', 'feat(x00001): the work');
	return repo.git('rev-parse', 'HEAD').trim();
};

const PLAIN_SLICE = `### S1 — the work
- **Status**: review
- **Files**: \`src\`
`;

describe('approvalNote', () => {
	it('carries how each acceptance line was checked, so a reader can verify it', () => {
		const note = approvalNote(
			{
				commitHash: 'abcdef0123456789',
				testsPassing: 5,
				testsTotal: 5,
				acceptanceCriteria: [
					{
						criterion: 'hooks keep their env',
						evidence:
							'ran readGit in a second repo under GIT_DIR: status was its own',
					},
					{ criterion: 'long', evidence: `${'x'.repeat(200)}\nend` },
				],
			},
			'looks right',
		);
		expect(note).toMatch(
			/^verified at abcdef012345, validate exit 0 and tests 5\/5 claimed, no recorded run cited; acceptance 2\/2: \(1\) ran readGit/u,
		);
		expect(note).toContain(`(2) ${'x'.repeat(159)}…`);
		expect(note.endsWith(' — looks right')).toBe(true);
		expect(
			approvalNote(
				{
					commitHash: 'abcdef0123456789',
					testsPassing: 1,
					testsTotal: 1,
					acceptanceCriteria: [{ criterion: 'c', evidence: 'e' }],
				},
				'',
			),
		).toBe(
			'verified at abcdef012345, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) e',
		);
	});

	it('states what was checked, then the reviewer’s reason', () => {
		const evidence = {
			commitHash: 'abcdef0123456789',
			testsPassing: 22,
			testsTotal: 22,
		};
		expect(approvalNote(evidence, '')).toBe(
			'verified at abcdef012345, validate exit 0 and tests 22/22 claimed, no recorded run cited',
		);
		expect(approvalNote(evidence, ' covers the refusal ')).toBe(
			'verified at abcdef012345, validate exit 0 and tests 22/22 claimed, no recorded run cited — covers the refusal',
		);
	});
});

describe('recordedRun', () => {
	const journal = [
		JSON.stringify({
			runId: 'r1',
			result: 'pass',
			command: 'vitest run a.spec.ts',
			totals: { passed: 9, tests: 9 },
		}),
		'{"runId": "r2", torn',
		JSON.stringify({
			runId: 'r3',
			result: 'fail',
			command: 'vitest run b.spec.ts',
			totals: { passed: 1, tests: 2 },
		}),
	].join('\n');

	it('names the run the journal recorded, a torn line skipped', () => {
		expect(recordedRun(journal, 'r1')).toEqual({
			runId: 'r1',
			result: 'pass',
			command: 'vitest run a.spec.ts',
			passed: 9,
			tests: 9,
		});
		expect(recordedRun(journal, 'r3')?.result).toBe('fail');
		expect(recordedRun(journal, 'r2')).toBeUndefined();
		expect(recordedRun(journal, 'nope')).toBeUndefined();
	});

	it('makes the note name the run instead of claiming a validate', () => {
		const run = recordedRun(journal, 'r1');
		expect(
			approvalNote(
				{
					commitHash: 'abcdef0123456789',
					testsPassing: 9,
					testsTotal: 9,
				},
				'fine',
				run,
			),
		).toBe(
			'verified at abcdef012345, run r1 passed: `vitest run a.spec.ts` (9/9) — fine',
		);
	});
});

describe('an approval', () => {
	it('writes its evidence into the proposal, even with no note', async () => {
		const commit = deliver();
		repo.proposalInReview(PLAIN_SLICE);

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.isError).toBe(false);
		const written = repo
			.git('ls-files', 'docs/delendai/proposals')
			.split('\n')
			.concat(
				repo
					.git('ls-files', '--others', 'docs/delendai/proposals')
					.split('\n'),
			)
			.filter((file) => file.includes('x00001'))
			.map((file) => {
				try {
					return readFileSync(join(repo.root, file), 'utf8');
				} catch {
					return '';
				}
			})
			.join('\n');
		expect(written).toContain(
			`approved by agent-b — verified at ${commit.slice(0, 12)}, validate exit 0`,
		);
	});

	it('names the run it cites, and is refused for a run the journal lacks or that failed', async () => {
		const commit = deliver();
		repo.proposalInReview(PLAIN_SLICE);
		mkdirSync(join(repo.root, '.cache/delendai/results/logs'), {
			recursive: true,
		});
		writeFileSync(
			join(repo.root, '.cache/delendai/results/logs/test-runs.jsonl'),
			`${[
				{
					runId: 'run-pass',
					result: 'pass',
					command: 'vitest run a.spec.ts',
					totals: { passed: 3, tests: 3 },
				},
				{
					runId: 'run-fail',
					result: 'fail',
					command: 'vitest run b.spec.ts',
					totals: { passed: 1, tests: 2 },
				},
			]
				.map((entry) => JSON.stringify(entry))
				.join('\n')}\n`,
		);
		const approve = (runId: string) =>
			repo.review({
				action: 'approve',
				agent: 'agent-b',
				evidence: { ...EVIDENCE, commitHash: commit, runId },
			});

		const missing = await approve('run-nowhere');
		expect(missing.isError).toBe(true);
		expect(JSON.stringify(missing)).toContain('is not in');
		const failed = await approve('run-fail');
		expect(failed.isError).toBe(true);
		expect(JSON.stringify(failed)).toContain('failed');

		const passed = await approve('run-pass');
		expect(passed.isError).toBe(false);
		const written = repo
			.git('ls-files', '--cached', '--others', 'docs/delendai/proposals')
			.split('\n')
			.filter((file) => file.includes('x00001'))
			.map((file) => {
				try {
					return readFileSync(join(repo.root, file), 'utf8');
				} catch {
					return '';
				}
			})
			.join('\n');
		expect(written).toContain(
			'run run-pass passed: `vitest run a.spec.ts` (3/3)',
		);
	});

	it('is refused for a commit the integration branch does not have', async () => {
		deliver();
		repo.git('switch', '-q', '-c', 'not-landed');
		writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 2;\n');
		repo.git('add', 'src/a.ts');
		repo.git('commit', '-q', '--no-verify', '-m', 'feat: still changing');
		const unlanded = repo.git('rev-parse', 'HEAD').trim();
		repo.git('switch', '-q', 'develop');
		repo.proposalInReview(PLAIN_SLICE);

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: unlanded },
		});

		expect(approved.isError).toBe(true);
		expect(JSON.stringify(approved.body)).toContain('is not on develop');
	});
});

describe('a change request', () => {
	it('names the commit it objects to when the work was delivered', async () => {
		const commit = deliver();
		repo.proposalInReview(SLICE_S1('review'));

		const rejected = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'I could not inspect the diff nor run the gate',
		});

		expect(rejected.isError).toBe(true);
		expect(JSON.stringify(rejected.body)).toContain(commit);
		expect(JSON.stringify(rejected.body)).toContain('names no commit');
	});
});

describe('an approval of a delivery the proposal has since replaced', () => {
	const REF = 'delendai/pr/agent-a/implement/x00001-S1-g1/the-work';

	it('is refused with the newer delivery named, and the newer one is approved', async () => {
		const first = repo.deliverThroughPullRequest('src/a.ts', REF);
		const second = repo.deliverThroughPullRequest(
			'src/a.ts',
			REF,
			'fix: the work, reworked',
			`Merge pull request #8 from Owner/${REF}`,
		);
		repo.proposalInReview(SLICE_S1('review'));

		const stale = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: first },
		});
		expect(stale.isError).toBe(true);
		expect(stale.text).toContain('delivered again by');
		expect(stale.text).toContain(
			repo.git('rev-parse', 'develop').slice(0, 12),
		);

		const current = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: second },
		});
		expect(current.isError).toBe(false);
	});

	it('is not refused for a later change to the files that is no delivery of the proposal', async () => {
		const first = repo.deliverThroughPullRequest('src/a.ts', REF);
		writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 3;\n');
		repo.git('add', 'src/a.ts');
		repo.git('commit', '-q', '--no-verify', '-m', 'refactor: a rename');
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: first },
		});
		expect(approved.isError).toBe(false);
	});
});

describe('an approval the proposal has since outgrown', () => {
	const REF = 'delendai/pr/agent-a/implement/x00001-S1-g1/the-work';

	it('is stale once the slice is delivered again, and not before', async () => {
		const first = repo.deliverThroughPullRequest('src/a.ts', REF);
		const run = createGitRunner(repo.root);
		const slices = [
			{
				id: 'S1',
				files: ['src/a.ts'],
				block: `- review-log: approved by agent-b — verified at ${first.slice(0, 12)}, validate exit 0 and tests 3/3 claimed, no recorded run cited`,
			},
			// A slice nobody approved, and one approved with no commit, say nothing.
			{ id: 'S2', files: ['src/a.ts'], block: '- **Status**: review' },
			{
				id: 'S3',
				files: ['src/a.ts'],
				block: '- review-log: approved by agent-b — looks right',
			},
		];

		expect(await staleApprovals(run, 'develop', 'x00001', slices)).toEqual(
			[],
		);

		repo.deliverThroughPullRequest(
			'src/a.ts',
			REF,
			'fix: the work, reworked',
			`Merge pull request #8 from Owner/${REF}`,
		);
		const stale = await staleApprovals(run, 'develop', 'x00001', slices);
		expect(stale).toHaveLength(1);
		expect(stale[0]).toMatchObject({
			slice: 'S1',
			judged: first.slice(0, 12),
			newer: repo.git('rev-parse', 'develop'),
		});
	});
});
