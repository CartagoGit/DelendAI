/**
 * A proposal closes only with an independent approval (x00696).
 */
import { describe, expect, it } from 'vitest';

import { unapprovedSlices } from './closed-with-independent-approval.script';

const slice = (lines: string) => `### S1 — the work

- **Status**: done
${lines}
`;

describe('unapprovedSlices', () => {
	it('accepts a slice approved by someone other than its implementer', () => {
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: claude-opus-5-5\n- review-log: approved by glm-5.3-max — verified',
				),
			),
		).toEqual([]);
	});

	it('refuses a slice with no approval, or approved only by its implementer', () => {
		expect(
			unapprovedSlices(slice('- review-implementer: minimax-3')),
		).toEqual(['S1 — the work']);
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: minimax-3\n- review-log: approved by minimax-3 — mine',
				),
			),
		).toEqual(['S1 — the work']);
	});

	it('does not count a requested change as an approval', () => {
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: a\n- review-log: requested_changes by b — fix it',
				),
			),
		).toEqual(['S1 — the work']);
	});

	it('does not judge a heading that is not a slice (x00696)', () => {
		expect(
			unapprovedSlices(
				`${slice('- review-implementer: a\n- review-log: approved by b — ok')}\n### solid-compliance, 2026-09-08\n\nmeasured.\n`,
			),
		).toEqual([]);
	});

	it('judges only finished slices', () => {
		expect(
			unapprovedSlices(`### S2 — later

- **Status**: dropped
`),
		).toEqual([]);
	});
});
