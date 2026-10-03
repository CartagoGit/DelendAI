/**
 * independent-approval.spec.ts — the one rule for reaching `done` (x00718).
 */
import { describe, expect, it } from 'vitest';

import {
	isSelfApproval,
	unapprovedSlices,
} from '@delendai/proposals/lib/shared/independent-approval';

const slice = (title: string, lines: readonly string[]) =>
	[`### ${title}`, '', '- **Status**: done', ...lines, ''].join('\n');

describe('the one approval rule (x00718)', () => {
	it('needs every finished slice approved by someone other than its implementer', () => {
		const doc = [
			'## Slices',
			'',
			slice('S1 — a', [
				'- review-implementer: glm-5',
				'- review-log: approved by minimax-m3 — checked',
			]),
			slice('S2 — b', [
				'- review-implementer: glm-5',
				'- review-log: approved by glm-5 — mine',
			]),
		].join('\n');
		expect(unapprovedSlices(doc)).toEqual(['S2 — b']);
	});

	it('reads both spellings of the review fields', () => {
		const doc = slice('S1 — a', [
			'- **review-implementer**: glm-5',
			'- **review-log**: approved by minimax-m3 — checked',
		]);
		expect(unapprovedSlices(doc)).toEqual([]);
	});

	it('lets another instance of the same model approve when the project allows it', () => {
		const doc = slice('S1 — a', [
			'- review-implementer: minimax-m3',
			'- review-log: approved by minimax-m3 — another instance checked',
		]);
		expect(unapprovedSlices(doc, 'model')).toEqual(['S1 — a']);
		expect(unapprovedSlices(doc, 'instance')).toEqual([]);
		expect(isSelfApproval('minimax-m3', 'MiniMax-M3', 'model')).toBe(true);
		expect(isSelfApproval('minimax-m3', 'minimax-m3', 'instance')).toBe(
			false,
		);
	});

	it('still needs an approval to exist, in either mode', () => {
		const doc = slice('S1 — a', ['- review-implementer: minimax-m3']);
		expect(unapprovedSlices(doc, 'instance')).toEqual(['S1 — a']);
	});
});
