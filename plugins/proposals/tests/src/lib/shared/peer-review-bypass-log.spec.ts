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
		const originalNow = Date.now;
		const t0 = originalNow();
		// The clock is frozen for the whole test, not just for the expiry
		// step. It used to advance for real during the accumulation loop
		// while the TTL was 1s, so whenever inserting 1000 events took
		// longer than the window — `gc()` runs on every insert — the
		// earliest events were evicted mid-loop and the count came out
		// short. A full `validate` produced 695 instead of 1000, which
		// measured how busy the machine was rather than whether the
		// buffer is bounded.
		try {
			Date.now = () => t0;
			for (let i = 0; i < 1000; i += 1) {
				recordPeerReviewBypass({
					proposalId: `f${i}`,
					reason: 'bulk emergency ship',
					via: 'force',
					// c00513: route the audit line to a sink instead of
					// `console.warn`, which this loop would otherwise call a
					// thousand times into the suite's stderr.
					log: () => {},
				});
			}
			expect(getPeerReviewBypassCount()).toBe(1000);

			// Step past the window: recording ANOTHER event should GC every
			// event older than the 1s window, not accumulate to 1001.
			Date.now = () => t0 + 2000;
			recordPeerReviewBypass({
				proposalId: 'f-fresh',
				reason: 'after the window',
				via: 'skipPeerReview',
				log: () => {},
			});
			expect(getPeerReviewBypassCount()).toBe(1);
			expect(listPeerReviewBypasses()[0]?.proposalId).toBe('f-fresh');
		} finally {
			Date.now = originalNow;
		}
	});
});
