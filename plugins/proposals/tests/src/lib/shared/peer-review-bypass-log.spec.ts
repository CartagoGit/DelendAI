import { beforeEach, describe, expect, it } from 'vitest';

import {
	getPeerReviewBypassCount,
	listPeerReviewBypasses,
	recordPeerReviewBypass,
	resetPeerReviewBypassLog,
	setPeerReviewBypassTtlMsForTests,
} from '@delendai/proposals/lib/shared/peer-review-bypass-log';

describe('peer-review-bypass-log (a00069 S11)', () => {
	beforeEach(() => resetPeerReviewBypassLog());

	it('rejects empty reason', () => {
		expect(() =>
			recordPeerReviewBypass({
				proposalId: 'f1',
				reason: '   ',
				via: 'force',
			}),
		).toThrow(/non-empty reason/i);
		expect(getPeerReviewBypassCount()).toBe(0);
	});

	it('records force and skipPeerReview events', () => {
		recordPeerReviewBypass({
			proposalId: 'f1',
			reason: 'emergency ship',
			via: 'force',
			agent: 'ops',
		});
		recordPeerReviewBypass({
			proposalId: 'f2',
			reason: 'host override',
			via: 'skipPeerReview',
		});
		expect(getPeerReviewBypassCount()).toBe(2);
		const events = listPeerReviewBypasses();
		expect(events[0]?.kind).toBe('peer-review-bypassed');
		expect(events[0]?.via).toBe('force');
		expect(events[0]?.agent).toBe('ops');
		expect(events[1]?.via).toBe('skipPeerReview');
		expect(events[1]?.agent).toBe('unknown');
	});

	// x00157 S2 — `events[]` used to grow forever; `state_health`'s
	// peer-review-bypass-count metric would inflate to the lifetime
	// total on a long-running host instead of staying a recent
	// snapshot. Bounded to a TTL window (24h in production; overridden
	// here to 1s so the test does not actually wait a day).
	it('stays bounded by TTL instead of growing forever (x00157 S2)', () => {
		setPeerReviewBypassTtlMsForTests(1000);
		for (let i = 0; i < 1000; i += 1) {
			recordPeerReviewBypass({
				proposalId: `f${i}`,
				reason: 'bulk emergency ship',
				via: 'force',
			});
		}
		expect(getPeerReviewBypassCount()).toBe(1000);

		// Recording ANOTHER event after the TTL has elapsed should GC
		// every event older than the 1s window, not accumulate to 1001.
		const future = new Date(Date.now() + 2000).toISOString();
		const originalNow = Date.now;
		Date.now = () => new Date(future).getTime();
		try {
			recordPeerReviewBypass({
				proposalId: 'f-fresh',
				reason: 'after the window',
				via: 'skipPeerReview',
			});
		} finally {
			Date.now = originalNow;
		}
		expect(getPeerReviewBypassCount()).toBe(1);
		expect(listPeerReviewBypasses()[0]?.proposalId).toBe('f-fresh');
	});
});
