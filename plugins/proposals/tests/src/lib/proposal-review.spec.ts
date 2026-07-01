import { describe, expect, it } from 'vitest';

import {
	EMPTY_REVIEW,
	parseReviewState,
	renderReviewLines,
	reviewTransition,
	type IReviewState,
} from '@mcp-vertex/proposals/lib/swarm/proposal-review';

describe('proposal review state machine (M35)', async () => {
	it('submit moves to in_review and records the implementer', async () => {
		const r = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon');
		expect(r.ok).toBe(true);
		expect(r.next).toMatchObject({
			status: 'in_review',
			implementer: 'falcon',
			reviewer: null,
		});
	});

	it('a reviewer cannot be the implementer under review (independence)', async () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon')
			.next!;
		const approve = reviewTransition(submitted, 'approve', 'falcon');
		expect(approve.ok).toBe(false);
		expect(approve.reason).toMatch(/different agent/i);
	});

	it('a different agent approves → done', async () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon')
			.next!;
		const approved = reviewTransition(submitted, 'approve', 'eagle');
		expect(approved.ok).toBe(true);
		expect(approved.next?.status).toBe('done');
		expect(approved.next?.reviewer).toBe('eagle');
		expect(approved.next?.rounds.at(-1)).toMatchObject({
			verdict: 'approved',
			agent: 'eagle',
		});
	});

	it('request_changes needs a note and sends it back to changes_requested', async () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon')
			.next!;
		expect(reviewTransition(submitted, 'request_changes', 'eagle').ok).toBe(
			false,
		); // no note
		const changed = reviewTransition(
			submitted,
			'request_changes',
			'eagle',
			'missing test for edge case',
		);
		expect(changed.ok).toBe(true);
		expect(changed.next?.status).toBe('changes_requested');
		expect(changed.next?.rounds.at(-1)).toMatchObject({
			verdict: 'requested_changes',
			agent: 'eagle',
			note: 'missing test for edge case',
		});
	});

	it('loops until a reviewer has no objection (rework → re-review by another)', async () => {
		let s: IReviewState = EMPTY_REVIEW;
		s = reviewTransition(s, 'submit', 'falcon').next!; // falcon implements
		s = reviewTransition(s, 'request_changes', 'eagle', 'fix A').next!; // eagle objects
		expect(s.status).toBe('changes_requested');
		s = reviewTransition(s, 'submit', 'falcon').next!; // falcon fixes & resubmits
		expect(s.status).toBe('in_review');
		// a fresh reviewer verifies the fix
		s = reviewTransition(s, 'approve', 'owl').next!;
		expect(s.status).toBe('done');
		expect(s.rounds).toHaveLength(2);
		expect(s.rounds.map((r) => r.verdict)).toEqual([
			'requested_changes',
			'approved',
		]);
	});

	it('cannot review when nothing is in review; cannot reopen a done slice', async () => {
		expect(reviewTransition(EMPTY_REVIEW, 'approve', 'eagle').ok).toBe(
			false,
		);
		const done: IReviewState = {
			status: 'done',
			implementer: 'falcon',
			reviewer: 'eagle',
			rounds: [],
		};
		expect(reviewTransition(done, 'submit', 'falcon').ok).toBe(false);
	});

	it('parse ∘ render round-trips the state', async () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon')
			.next!;
		const changed = reviewTransition(
			submitted,
			'request_changes',
			'eagle',
			'note here',
		).next!;
		const body = `- files: a.ts\n${renderReviewLines(changed).join('\n')}\n`;
		const parsed = parseReviewState(body);
		expect(parsed.status).toBe('changes_requested');
		expect(parsed.reviewer).toBe('eagle');
		expect(parsed.implementer).toBe('falcon');
		expect(parsed.rounds).toHaveLength(1);
		expect(parsed.rounds[0]).toMatchObject({
			verdict: 'requested_changes',
			agent: 'eagle',
			note: 'note here',
		});
	});

	it('after request_changes, the SAME reviewer cannot approve the fix (chain-of-distinct-reviewers, x00056)', async () => {
		let s: IReviewState = EMPTY_REVIEW;
		s = reviewTransition(s, 'submit', 'falcon').next!;
		s = reviewTransition(s, 'request_changes', 'eagle', 'fix A').next!;
		s = reviewTransition(s, 'submit', 'falcon').next!; // falcon fixes & resubmits
		// eagle already weighed in on the previous round — must NOT be allowed to verify the fix
		const sameReviewerApprove = reviewTransition(s, 'approve', 'eagle');
		expect(sameReviewerApprove.ok).toBe(false);
		expect(sameReviewerApprove.reason).toMatch(/different agent than the previous reviewer/i);
		// a fresh reviewer verifies
		const freshApprove = reviewTransition(s, 'approve', 'owl');
		expect(freshApprove.ok).toBe(true);
		expect(freshApprove.next?.status).toBe('done');
		expect(freshApprove.next?.rounds.at(-1)).toMatchObject({
			verdict: 'approved',
			agent: 'owl',
		});
	});

	it('first-round approve by a fresh reviewer is allowed (no prior round to conflict with)', async () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon')
			.next!;
		const approved = reviewTransition(submitted, 'approve', 'eagle');
		expect(approved.ok).toBe(true);
		expect(approved.next?.rounds).toHaveLength(1);
	});
});
