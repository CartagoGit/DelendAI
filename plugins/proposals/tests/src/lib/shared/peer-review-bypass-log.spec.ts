import { beforeEach, describe, expect, it } from 'vitest';

import {
	getPeerReviewBypassCount,
	listPeerReviewBypasses,
	recordPeerReviewBypass,
	resetPeerReviewBypassLog,
} from '@mcp-vertex/proposals/lib/shared/peer-review-bypass-log';

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
});
