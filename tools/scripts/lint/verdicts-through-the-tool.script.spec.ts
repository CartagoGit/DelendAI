/**
 * verdicts-through-the-tool.script.spec.ts — a review line typed by hand
 * is told from one the review tool wrote.
 */
import { describe, expect, it } from 'vitest';

import {
	handWrittenVerdicts,
	reviewLineKeys,
} from './verdicts-through-the-tool.script';

const verdict = [
	'+- review-state: done',
	'+- review-reviewer: minimax-m3.1',
	'+- review-log: approved by minimax-m3.1 — verified at abc',
].join('\n');

describe('handWrittenVerdicts', () => {
	it('[<20ms] accepts the review lines the tool committed under its own subject', () => {
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

	it('[<20ms] names a commit that writes them under any other subject', () => {
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

	it('[<20ms] lets a commit remove review lines: only writing one is a verdict', () => {
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

	const file = 'docs/delendai/proposals/x1.md';
	const toolLines = [
		'### S1 — one',
		'- review-state: in_review',
		'- review-implementer: claude-opus-5-5',
		'### S2 — two',
	].join('\n');
	const diffAdding = (lines: readonly string[], start: number): string =>
		[
			`+++ b/${file}`,
			`@@ -0,0 +${String(start)},${String(lines.length)} @@`,
			...lines.map((line) => `+${line}`),
		].join('\n');

	it('[<20ms] accepts a revert that restores exactly what a tool commit wrote', () => {
		const restored = diffAdding(
			[
				'- review-state: in_review',
				'- review-implementer: claude-opus-5-5',
			],
			2,
		);
		expect(
			handWrittenVerdicts([
				{
					sha: 't1',
					subject:
						'chore(delendai): delendai_proposals_proposal_transition x1 review',
					diff: '',
					documents: new Map([[file, toolLines]]),
				},
				{
					sha: 'r1',
					subject: 'Revert "docs: drop lines"',
					diff: restored,
					documents: new Map([[file, toolLines]]),
				},
			]),
		).toEqual([]);
	});

	it('[<20ms] accepts a restore of what the range base already carries', () => {
		expect(
			handWrittenVerdicts(
				[
					{
						sha: 'r2',
						subject: 'Revert "docs: drop lines"',
						diff: diffAdding(['- review-state: in_review'], 2),
						documents: new Map([[file, toolLines]]),
					},
				],
				new Set(reviewLineKeys(file, toolLines)),
			),
		).toEqual([]);
	});

	it('[<20ms] refuses a forged line, altered or in another slice', () => {
		const known = new Set(reviewLineKeys(file, toolLines));
		const forgedHere = [
			'### S1 — one',
			'- review-state: done',
			'### S2 — two',
			'- review-state: in_review',
		].join('\n');
		const found = handWrittenVerdicts(
			[
				{
					sha: 'f1',
					subject: 'docs: tidy',
					diff: diffAdding(['- review-state: done'], 2),
					documents: new Map([[file, forgedHere]]),
				},
				{
					sha: 'f2',
					subject: 'docs: tidy',
					diff: diffAdding(['- review-state: in_review'], 4),
					documents: new Map([[file, forgedHere]]),
				},
			],
			known,
		);
		expect(found.map((commit) => commit.sha)).toEqual(['f1', 'f2']);
	});

	const keepSubject = 'chore(wip): keep the uncommitted work found at start';
	const stamp = '+last-transition-id: 0f533c39-7298-4f81-a1f0-802461290ae8';

	it('[<20ms] accepts the transition lines a keep commit swallowed (c8a5c88f0)', () => {
		expect(
			handWrittenVerdicts([
				{
					sha: 'c8a5c88f0',
					subject: keepSubject,
					diff: [
						stamp,
						'- review-state: in_review',
						'- review-implementer: claude-opus-5-5',
					]
						.map((row) => (row.startsWith('+') ? row : `+${row}`))
						.join('\n'),
				},
			]),
		).toEqual([]);
	});

	it('[<20ms] still refuses a verdict in a keep commit, or lines with no transition id', () => {
		const found = handWrittenVerdicts([
			{
				sha: 'k1',
				subject: keepSubject,
				diff: [
					stamp,
					'+- review-state: done',
					'+- review-log: approved by me',
				].join('\n'),
			},
			{
				sha: 'k2',
				subject: keepSubject,
				diff: '+- review-state: in_review',
			},
		]);
		expect(found.map((commit) => commit.sha)).toEqual(['k1', 'k2']);
		expect(found[0]?.lines).toEqual([
			'- review-state: done',
			'- review-log: approved by me',
		]);
	});
});
