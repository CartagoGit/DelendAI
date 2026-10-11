/**
 * proposal-review-sent-back.spec.ts — the slices a pack sends back are
 * reopened, each one, and their resubmission brings the proposal back to
 * review.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createReviewRepo, SLICE_S1, type IReviewRepo } from './review-repo';

let repo: IReviewRepo;

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe('a pack that sends slices back, and their return', () => {
	it('reopens every slice a pack sends back, not only the first', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}\n### S2 — more work\n- **Status**: review\n- **Files**: \`src/b.ts\`\n- review-state: in_review\n- review-implementer: agent-a\n`,
		);

		await repo.review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'nothing was delivered for S1',
		});
		const second = await repo.review({
			sliceId: 'S2',
			action: 'request_changes',
			agent: 'agent-b',
			note: 'nothing was delivered for S2',
		});

		// The first request reopened the proposal; the second finds it
		// open, and its slice goes back to its author all the same.
		expect(second.body).toMatchObject({ status: 'changes_requested' });
		const markdown = readFileSync(
			join(
				repo.root,
				'docs/delendai/proposals/in-progress/x00001-work.md',
			),
			'utf8',
		);
		expect(
			markdown.match(/^- \*\*Status\*\*: in-progress$/gmu),
		).toHaveLength(2);
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
