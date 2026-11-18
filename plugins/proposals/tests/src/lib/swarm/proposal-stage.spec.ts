/**
 * proposal-stage.spec.ts — a proposal's review-state is read from the
 * review-state its slices carry, and nothing else.
 */
import { describe, expect, it } from 'vitest';

import {
	isSentBack,
	proposalReviewState,
	sentBackNextAction,
	sentBackSliceIds,
	sliceBlockById,
} from '@delendai/proposals/lib/swarm/proposal-stage';

const doc = (...slices: readonly string[]): string =>
	`---\nid: x00001\nstatus: review\n---\n\n# x00001\n\n${slices.join('\n')}`;

const slice = (id: string, lines: string): string =>
	`### ${id} — work\n${lines}\n`;

describe('proposalReviewState', () => {
	it('is in_review while a slice waits for its verdict', () => {
		const markdown = doc(
			slice(
				'S1',
				'- **Status**: pending\n- review-state: changes_requested',
			),
			slice('S2', '- **Status**: review\n- review-state: in_review'),
		);
		expect(proposalReviewState(markdown)).toBe('in_review');
		expect(isSentBack(markdown)).toBe(false);
	});

	it('counts a slice handed in with no round yet as waiting', () => {
		expect(
			proposalReviewState(
				doc(
					slice(
						'S1',
						'- **Status**: pending\n- review-state: changes_requested',
					),
					slice('S2', '- **Status**: review'),
				),
			),
		).toBe('in_review');
	});

	it('is changes_requested when none waits and one was sent back', () => {
		const markdown = doc(
			slice('S1', '- **Status**: done\n- review-state: done'),
			slice(
				'S2',
				'- **Status**: pending\n- review-state: changes_requested',
			),
		);
		expect(proposalReviewState(markdown)).toBe('changes_requested');
		expect(isSentBack(markdown)).toBe(true);
		expect([...sentBackSliceIds(markdown)]).toEqual(['S2']);
	});

	it('is done when every slice with a round is approved, and none before any', () => {
		expect(
			proposalReviewState(
				doc(slice('S1', '- **Status**: done\n- review-state: done')),
			),
		).toBe('done');
		expect(
			proposalReviewState(doc(slice('S1', '- **Status**: pending'))),
		).toBe('none');
	});

	it('is not spoofed by the frontmatter', () => {
		expect(
			proposalReviewState(
				'---\nid: x1\n- review-state: changes_requested\n---\n\n### S1 — a\n- **Status**: pending\n',
			),
		).toBe('none');
	});

	it('tells the reader the verdict was the move', () => {
		expect(sentBackNextAction('x00001')).toContain(
			'nothing is moved by hand',
		);
	});
});

describe('sliceBlockById', () => {
	const markdown = doc(
		slice(
			'S1',
			'- **Status**: done\n- review-log: approved by agent-b — ok',
		),
		slice('S2', '- **Status**: review\n- review-state: in_review'),
		'## acceptance\n\n- review-state: changes_requested\n',
	);

	it('reads a slice whole, up to the slice that follows it', () => {
		// Read to its own heading only, it was "#", and the stale-verdict
		// gate on close never saw an approval.
		const first = sliceBlockById(markdown, 's1');
		expect(first).toContain('S1 — work');
		expect(first).toContain('approved by agent-b');
		expect(first).not.toContain('S2');
	});

	it('stops the last slice at the next section', () => {
		const last = sliceBlockById(markdown, 'S2');
		expect(last).toContain('review-state: in_review');
		expect(last).not.toContain('acceptance');
		expect(last).not.toContain('changes_requested');
		expect(proposalReviewState(markdown)).toBe('in_review');
	});

	it('answers nothing for a slice the document lacks', () => {
		expect(sliceBlockById(markdown, 'S9')).toBe('');
	});
});
