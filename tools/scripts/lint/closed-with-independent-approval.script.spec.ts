/**
 * A proposal closes only with an independent approval (x00696).
 */
import { describe, expect, it } from 'vitest';

import {
	agentOfRef,
	approvalsAdded,
	kindOfRef,
	approvalsNotBy,
	unapprovedSlices,
} from './closed-with-independent-approval.script';

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

describe('an approval enters through its reviewer (x00715)', () => {
	const prefixes = ['delendai/pr/', 'heads/delendai/wip/'];

	it('reads the agent a ref belongs to, under any spelling of the prefix', () => {
		expect(
			agentOfRef('delendai/pr/glm-5/review/batch-all-g2/r', prefixes),
		).toBe('glm-5');
		expect(
			agentOfRef(
				'refs/heads/delendai/wip/minimax-m3/review/batch-all-g1/r',
				prefixes,
			),
		).toBe('minimax-m3');
		expect(agentOfRef('feature/owner-work', prefixes)).toBeUndefined();
	});

	it("names the approvals a diff adds that are not its author's", () => {
		const diff = [
			'+++ b/docs/delendai/proposals/review/x1.md',
			'+- review-log: approved by glm-5 — checked',
			'+- review-log: approved by minimax-m3 — checked',
			'-- review-log: approved by someone-removed — gone',
			' - review-log: approved by context-line — unchanged',
			'+- review-log: requested_changes by claude-opus-5 — no test',
		].join('\n');
		expect(approvalsNotBy(diff, 'glm-5')).toEqual(['minimax-m3']);
		expect(approvalsNotBy(diff, 'GLM-5')).toEqual(['minimax-m3']);
		expect(approvalsNotBy(diff, 'minimax-m3')).toEqual(['glm-5']);
	});
});

describe('an approval enters through a review unit (x00729)', () => {
	const prefixes = ['delendai/pr/', 'heads/delendai/wip/'];

	it('reads the kind of work a ref names', () => {
		expect(
			kindOfRef('delendai/pr/glm-5/review/batch-all-g2/r', prefixes),
		).toBe('review');
		expect(
			kindOfRef(
				'refs/heads/delendai/wip/minimax-m3/implement/x00001-S1-g1/t',
				prefixes,
			),
		).toBe('implement');
		expect(kindOfRef('delendai/pr/glm-5', prefixes)).toBeUndefined();
		expect(kindOfRef('feature/owner-work', prefixes)).toBeUndefined();
	});

	it('names every approval a diff adds, and nothing else', () => {
		const diff = [
			'+- review-log: approved by glm-5 — checked',
			'-- review-log: approved by gone — removed',
			'+- review-log: requested_changes by qwen — no test',
		].join('\n');
		expect(approvalsAdded(diff)).toEqual(['glm-5']);
	});
});
