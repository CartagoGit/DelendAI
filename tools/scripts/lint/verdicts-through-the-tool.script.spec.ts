/**
 * verdicts-through-the-tool.script.spec.ts — a review line typed by hand
 * is told from one the review tool wrote.
 */
import { describe, expect, it } from 'vitest';

import { handWrittenVerdicts } from './verdicts-through-the-tool.script';

const verdict = [
	'+- review-state: done',
	'+- review-reviewer: minimax-m3.1',
	'+- review-log: approved by minimax-m3.1 — verified at abc',
].join('\n');

describe('handWrittenVerdicts', () => {
	it('accepts the review lines the tool committed under its own subject', () => {
		expect(
			handWrittenVerdicts([
				{
					sha: 'a1',
					subject:
						'chore(delendai): delendai_proposals_proposal_review x00001 S1 approve',
					diff: verdict,
				},
			]),
		).toEqual([]);
	});

	it('names a commit that writes them under any other subject', () => {
		expect(
			handWrittenVerdicts([
				{
					sha: 'b2',
					subject: 'chore(review): approve x00001 S1',
					diff: verdict,
				},
				{
					sha: 'c3',
					subject: 'docs(proposals): add S2',
					diff: '+### S2 — more',
				},
			]),
		).toEqual([
			{
				sha: 'b2',
				subject: 'chore(review): approve x00001 S1',
				lines: [
					'- review-state: done',
					'- review-reviewer: minimax-m3.1',
					'- review-log: approved by minimax-m3.1 — verified at abc',
				],
			},
		]);
	});

	it('lets a commit remove review lines: only writing one is a verdict', () => {
		expect(
			handWrittenVerdicts([
				{
					sha: 'd4',
					subject: 'docs(proposals): drop hand-written lines',
					diff: '-- review-state: in_review',
				},
			]),
		).toEqual([]);
	});
});
