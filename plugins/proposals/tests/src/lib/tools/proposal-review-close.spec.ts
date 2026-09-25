/**
 * proposal-review-close.spec.ts — the approval that ends a proposal
 * closes it through the normal transition (x00643 S2).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('the approval that ends a proposal', () => {
	it('does not close a proposal whose other slices carry no approval', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(`${SLICE_S1('done')}
### S2 — more work
- **Status**: done
- **Files**: \`src/b.ts\`
`);

		const approved = await repo.review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body.status).toBe('done');
		expect(approved.body.proposalClosed).toBeUndefined();
		expect(
			existsSync(
				join(
					repo.root,
					'docs/delendai/proposals/review/x00001-work.md',
				),
			),
		).toBe(true);
	});

	it('keeps the approval and reports why the close was refused', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		repo.proposalInReview(SLICE_S1('review'));

		const approved = await repo.review(
			{
				action: 'approve',
				agent: 'agent-b',
				evidence: { ...EVIDENCE, commitHash: commit },
			},
			{ requireValidateEvidence: true },
		);

		expect(approved.isError).toBe(false);
		expect(approved.body.status).toBe('done');
		expect(approved.body.proposalClosed).toBe(false);
		expect(approved.body.proposalCloseBlocker).toEqual(expect.any(String));
		const markdown = readFileSync(
			join(repo.root, 'docs/delendai/proposals/review/x00001-work.md'),
			'utf8',
		);
		expect(markdown).toContain('- review-state: done');
		expect(markdown).toMatch(/^status: review$/mu);
	});
});
