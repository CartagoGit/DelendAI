/**
 * review-verdict-evidence.spec.ts — a verdict names what it judged, where
 * a reader of the proposal can check it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { approvalNote } from '@delendai/proposals/lib/services/review-verdict-evidence';

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
	it('states what was checked, then the reviewer’s reason', () => {
		const evidence = {
			commitHash: 'abcdef0123456789',
			testsPassing: 22,
			testsTotal: 22,
		};
		expect(approvalNote(evidence, '')).toBe(
			'verified at abcdef012345, validate exit 0, tests 22/22',
		);
		expect(approvalNote(evidence, ' covers the refusal ')).toBe(
			'verified at abcdef012345, validate exit 0, tests 22/22 — covers the refusal',
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
