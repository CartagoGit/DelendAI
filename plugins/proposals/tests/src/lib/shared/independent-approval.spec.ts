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

	it('takes another spelling of the model for the same model', () => {
		expect(isSelfApproval('minimax-m3', 'MiniMax-M3', 'model')).toBe(true);
		expect(isSelfApproval('minimax-m3', 'minimaxm3', 'instance')).toBe(
			true,
		);
		expect(isSelfApproval('minimax-m3', 'glm-5.3-flash', 'instance')).toBe(
			false,
		);
	});

	it('lets another instance of the same model approve only when the two were seen to differ', () => {
		// Nothing compared: the same model under its own name proves nothing.
		expect(isSelfApproval('minimax-m3', 'minimax-m3', 'instance')).toBe(
			true,
		);
		expect(
			isSelfApproval('minimax-m3', 'minimax-m3', 'instance', {
				implementer: 'host:1',
				approver: 'host:1',
			}),
		).toBe(true);
		expect(
			isSelfApproval('minimax-m3', 'minimax-m3', 'instance', {
				implementer: 'host:1',
				approver: 'host:2',
			}),
		).toBe(false);
		// A project that wants another model gets one, whatever the instance.
		expect(
			isSelfApproval('minimax-m3', 'minimax-m3', 'model', {
				implementer: 'host:1',
				approver: 'host:2',
			}),
		).toBe(true);
	});

	it('closes on the same model only where the approval line carries the proof', () => {
		const bare = slice('S1 — a', [
			'- review-implementer: minimax-m3',
			'- review-log: approved by minimax-m3 — checked',
		]);
		const proved = slice('S1 — a', [
			'- review-implementer: minimax-m3',
			'- review-log: approved by minimax-m3 — checked [another instance]',
		]);
		expect(unapprovedSlices(bare, 'instance')).toEqual(['S1 — a']);
		expect(unapprovedSlices(proved, 'instance')).toEqual([]);
		expect(unapprovedSlices(proved, 'model')).toEqual(['S1 — a']);
	});

	it('does not close work whose implementer nobody could name', () => {
		const doc = slice('S1 — a', [
			'- review-implementer: unrecorded',
			'- review-log: approved by glm-5.3-flash — checked',
		]);
		expect(unapprovedSlices(doc, 'model')).toEqual(['S1 — a']);
		expect(unapprovedSlices(doc, 'instance')).toEqual(['S1 — a']);
	});

	it('still needs an approval to exist, in either mode', () => {
		const doc = slice('S1 — a', ['- review-implementer: minimax-m3']);
		expect(unapprovedSlices(doc, 'instance')).toEqual(['S1 — a']);
	});
});
