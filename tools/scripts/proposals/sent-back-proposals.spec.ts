import { describe, expect, it } from 'vitest';

import {
	slicesSentBack,
	waitsOnNobody,
	withSentBackSlicesOpen,
} from './sent-back-proposals';

const proposal = (status: string, slices: string): string =>
	`---\nid: x00001\nstatus: ${status}\n---\n\n# x00001\n\n## slices\n\n${slices}\n## acceptance\n\n- it works\n`;

const SENT = `### S1 — one\n- **Status**: done\n- review-state: changes_requested\n- review-implementer: GitHub\n- review-log: requested_changes by b — broken\n\n`;
const APPROVED = `### S2 — two\n- **Status**: done\n- review-state: done\n- review-log: approved by b — fine\n\n`;

describe('a proposal in review with a slice sent back', () => {
	it('is found, with the slices that were sent back', () => {
		const markdown = proposal('review', SENT + APPROVED);
		expect(waitsOnNobody(markdown)).toBe(true);
		expect(slicesSentBack(markdown)).toEqual(['S1']);
	});

	it('is not found once it is back in progress, when nothing was sent back, or when the owner is deciding', () => {
		expect(waitsOnNobody(proposal('in-progress', SENT))).toBe(false);
		expect(waitsOnNobody(proposal('review', APPROVED))).toBe(false);
		expect(
			waitsOnNobody(
				proposal('review', SENT).replace(
					'status: review',
					'status: review\nowner-decision: pending',
				),
			),
		).toBe(false);
	});

	it('has its sent-back slices marked as work to do, and the others left alone', () => {
		const opened = withSentBackSlicesOpen(
			proposal('review', SENT + APPROVED),
		);
		expect(opened).toContain(
			'### S1 — one\n- **Status**: in-progress\n- review-state: changes_requested',
		);
		expect(opened).toContain('### S2 — two\n- **Status**: done');
	});
});
