/**
 * proposal-review-sent-back.spec.ts — the slices a pack sends back are
 * reopened, each one, and their resubmission brings the proposal back to
 * review.
 */
import { runProposalTransition } from '@delendai/proposals/lib/tools/proposal-transition.tool';
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

describe('a pack that sends slices back, and their return', () => {
	it('keeps the proposal in review while slices wait, and makes it ready with its findings once none does', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}\n### S2 — more work\n- **Status**: review\n- **Files**: \`src/b.ts\`\n- review-state: in_review\n- review-implementer: agent-a\n`,
		);

		const first = await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'nothing was delivered for S1',
		});
		// S2 still waits for its verdict: the review is not over.
		expect(first.body.proposalReopened).toBeUndefined();
		expect(
			existsSync(
				join(
					repo.root,
					'docs/delendai/proposals/review/x00001-work.md',
				),
			),
		).toBe(true);

		const second = await repo.review({
			sliceId: 'S2',
			action: 'request_changes',
			agent: 'agent-b',
			note: 'nothing was delivered for S2',
		});

		expect(second.body).toMatchObject({
			status: 'changes_requested',
			proposalReopened: true,
		});
		const ready = repo
			.git('ls-files', '--others', '--cached', 'docs/delendai/proposals')
			.split('\n')
			.find((path) => path.endsWith('x00001-work.md'));
		expect(ready).toMatch(/proposals\/ready\//u);
		const markdown = readFileSync(join(repo.root, ready ?? ''), 'utf8');
		// Each slice sent back is work to do, its finding beside it.
		expect(markdown.match(/^- \*\*Status\*\*: pending$/gmu)).toHaveLength(
			2,
		);
		expect(markdown).toContain('nothing was delivered for S2');
	});

	it('makes the proposal ready when its last verdict is an approval but a slice was sent back', async () => {
		const commit = repo.deliverThroughPullRequest(
			'src/b.ts',
			'delendai/pr/agent-a/x00001-S2-g1/the-work',
		);
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review\n- review-implementer: agent-a\n\n### S2 — more work\n- **Status**: review\n- **Files**: \`src/b.ts\`\n- review-state: in_review\n- review-implementer: agent-a\n`,
		);
		await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'S1 misses its acceptance',
		});

		const approved = await repo.review({
			sliceId: 'S2',
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(approved.body).toMatchObject({ proposalReopened: true });
		expect(approved.body.proposalClosed).toBeUndefined();
		expect(repo.documentOf()).toMatch(/proposals\/ready\//u);
	});

	it('tries to hand the proposal back to review when its last slice sent back is resubmitted', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review\n- review-implementer: agent-a\n\n### S2 — more work\n- **Status**: review\n- **Files**: \`src/b.ts\`\n- review-state: in_review\n- review-implementer: agent-a\n`,
		);
		for (const sliceId of ['S1', 'S2']) {
			await repo.review({
				sliceId,
				action: 'request_changes',
				agent: 'agent-b',
				note: `fix ${sliceId}`,
			});
		}

		// The review is over and the proposal ready: its implementer takes it.
		await runProposalTransition(
			{
				id: 'x00001',
				to: 'in-progress',
				reason: 'fixing',
				agent: 'agent-a',
			},
			repo.options(),
		);
		const first = await repo.review({
			sliceId: 'S1',
			action: 'submit',
			agent: 'agent-a',
			note: 'S1 fixed',
		});
		const last = await repo.review({
			sliceId: 'S2',
			action: 'submit',
			agent: 'agent-a',
			note: 'S2 fixed',
		});

		// One slice still to do: the proposal stays with its implementer.
		expect(first.body.proposalHandedOver).toBeUndefined();
		// None left: the hand-over runs, under the gates of any hand-over.
		// Here they refuse it (nothing was delivered), and say so.
		expect(last.body.proposalHandedOver).toBe(false);
		expect(last.body.proposalCloseBlocker).toContain('declared files');
		const markdown = readFileSync(
			join(
				repo.root,
				'docs/delendai/proposals/in-progress/x00001-work.md',
			),
			'utf8',
		);
		expect(markdown.match(/^- \*\*Status\*\*: review$/gmu)).toHaveLength(2);
	});
});
