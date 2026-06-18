import { describe, expect, it } from 'vitest';

import {
	EMPTY_REVIEW,
	parseReviewState,
	renderReviewLines,
	reviewTransition,
	type IReviewState,
} from '@mcp-vertex/proposals/lib/swarm/proposal-review';

describe('proposal review state machine (M35)', () => {
	it('submit moves to in_review and records the implementer', () => {
		const r = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon');
		expect(r.ok).toBe(true);
		expect(r.next).toMatchObject({ status: 'in_review', implementer: 'falcon', reviewer: null });
	});

	it('a reviewer cannot be the implementer under review (independence)', () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon').next!;
		const approve = reviewTransition(submitted, 'approve', 'falcon');
		expect(approve.ok).toBe(false);
		expect(approve.reason).toMatch(/different agent/i);
	});

	it('a different agent approves → done', () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon').next!;
		const approved = reviewTransition(submitted, 'approve', 'eagle');
		expect(approved.ok).toBe(true);
		expect(approved.next?.status).toBe('done');
		expect(approved.next?.reviewer).toBe('eagle');
		expect(approved.next?.rounds.at(-1)).toMatchObject({ verdict: 'approved', agent: 'eagle' });
	});

	it('request_changes needs a note and sends it back to changes_requested', () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon').next!;
		expect(reviewTransition(submitted, 'request_changes', 'eagle').ok).toBe(false); // no note
		const changed = reviewTransition(submitted, 'request_changes', 'eagle', 'missing test for edge case');
		expect(changed.ok).toBe(true);
		expect(changed.next?.status).toBe('changes_requested');
		expect(changed.next?.rounds.at(-1)).toMatchObject({
			verdict: 'requested_changes',
			agent: 'eagle',
			note: 'missing test for edge case',
		});
	});

	it('loops until a reviewer has no objection (rework → re-review by another)', () => {
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
		expect(s.rounds.map((r) => r.verdict)).toEqual(['requested_changes', 'approved']);
	});

	it('cannot review when nothing is in review; cannot reopen a done slice', () => {
		expect(reviewTransition(EMPTY_REVIEW, 'approve', 'eagle').ok).toBe(false);
		const done: IReviewState = { status: 'done', implementer: 'falcon', reviewer: 'eagle', rounds: [] };
		expect(reviewTransition(done, 'submit', 'falcon').ok).toBe(false);
	});

	it('parse ∘ render round-trips the state', () => {
		const submitted = reviewTransition(EMPTY_REVIEW, 'submit', 'falcon').next!;
		const changed = reviewTransition(submitted, 'request_changes', 'eagle', 'note here').next!;
		const body = `- files: a.ts\n${renderReviewLines(changed).join('\n')}\n`;
		const parsed = parseReviewState(body);
		expect(parsed.status).toBe('changes_requested');
		expect(parsed.reviewer).toBe('eagle');
		expect(parsed.implementer).toBe('falcon');
		expect(parsed.rounds).toHaveLength(1);
		expect(parsed.rounds[0]).toMatchObject({ verdict: 'requested_changes', agent: 'eagle', note: 'note here' });
	});
});
