/**
 * change-text-template.service.spec.ts — one title and body for every pull
 * request and issue, whoever made the work.
 */
import { describe, expect, it } from 'vitest';

import {
	proposalScope,
	renderChangeText,
	truncateSummary,
} from '@delendai/core/lib/change-text/change-text-template.service';

const headings = (body: string): string[] =>
	[...body.matchAll(/^## (.+)$/gm)].map((m) => m[1] ?? '');

const WORK = [
	'What',
	'Why',
	'Slices shipped',
	'Files and zones',
	'Proof',
	'Review notes',
];

describe('renderChangeText', () => {
	it('[<5ms] renders an implement title and the work sections in order', () => {
		const out = renderChangeText({
			kind: 'implement',
			proposalKind: 'fix',
			summary: 'Stop the leak',
			proposals: [{ proposal: 'x01003', slices: ['S2'] }],
			files: ['packages/core/src/a.ts', 'packages/core/src/b.ts'],
		});
		expect(out.title).toBe('fix(core): Stop the leak (x01003-S2)');
		expect(headings(out.body)).toEqual(WORK);
		expect(out.body).toContain('not proved locally');
	});

	it('[<5ms] renders a review with Verdicts in place of Slices shipped', () => {
		const out = renderChangeText({
			kind: 'review',
			summary: 'Review the batch',
			proposals: [{ proposal: 'd00418' }, { proposal: 'x00989' }],
			verdicts: [{ proposal: 'd00418', verdict: 'approved' }],
		});
		expect(out.title).toBe(
			'review(repo): Review the batch (d00418+x00989)',
		);
		expect(headings(out.body)).toEqual([
			'What',
			'Why',
			'Verdicts',
			'Files and zones',
			'Proof',
			'Review notes',
		]);
		expect(out.body).toContain('- d00418: approved');
	});

	it('[<5ms] renders create and batch-close as chore with the work sections', () => {
		for (const kind of ['create', 'batch-close'] as const) {
			const out = renderChangeText({
				kind,
				summary: 'Close approved',
				proposals: [{ proposal: 'x01004' }],
				proof: [{ step: 'typecheck', durationMs: 12 }],
			});
			expect(out.title).toBe('chore(repo): Close approved (x01004)');
			expect(headings(out.body)).toEqual(WORK);
			expect(out.body).toContain('- typecheck: 12 ms');
		}
	});

	it('[<5ms] renders an issue with its own sections', () => {
		const out = renderChangeText({
			kind: 'issue',
			summary: 'Crash on boot',
			files: ['plugins/issues/src/x.ts'],
			expected: 'starts',
			actual: 'throws',
			proposals: [{ proposal: 'f00809' }],
		});
		expect(out.title).toBe('fix(issues): Crash on boot (f00809)');
		expect(headings(out.body)).toEqual([
			'Summary',
			'Where',
			'Evidence',
			'Expected and Actual',
			'Proposal link',
		]);
		expect(out.body).toContain('Expected: starts\n\nActual: throws');
	});

	it('[<5ms] cuts the summary to 72 characters at a word boundary', () => {
		const long = 'word '.repeat(30);
		const cut = truncateSummary(long);
		expect(cut.length).toBeLessThanOrEqual(72);
		expect(cut.endsWith('word')).toBe(true);
		expect(truncateSummary('x'.repeat(100))).toHaveLength(72);
		expect(truncateSummary('short')).toBe('short');
	});

	it('[<5ms] never lets a caller override type, scope or section order', () => {
		const sneaky = {
			kind: 'implement' as const,
			summary: 'Real',
			proposals: [{ proposal: 'x1' }],
			files: ['packages/core/a.ts'],
			type: 'review',
			scope: 'evil',
			sections: ['Proof'],
		};
		const out = renderChangeText(sneaky);
		expect(out.title).toBe('feat(core): Real (x1)');
		expect(headings(out.body)).toEqual(WORK);
	});

	it('[<5ms] gives two agents with different ids the same shape', () => {
		const make = (agent: string) => ({
			kind: 'implement' as const,
			summary: 'Same work',
			proposals: [{ proposal: 'x1', slices: ['S1'] }],
			agent,
		});
		const a = renderChangeText(make('claude-sonnet-5-5'));
		const b = renderChangeText(make('glm-5.3-flash'));
		expect(a).toEqual(b);
	});
});

describe('proposalScope', () => {
	it.each([
		[[{ proposal: 'x01003' }], 'x01003'],
		[[{ proposal: 'x01003', slices: ['S2'] }], 'x01003-S2'],
		[[{ proposal: 'x01003', slices: ['S1', 'S2', 'S3'] }], 'x01003-S1-S3'],
		[[{ proposal: 'x01003', slices: ['S4', 'S1'] }], 'x01003-S1+S4'],
		[[{ proposal: 'x01004' }, { proposal: 'x01016' }], 'x01004+x01016'],
	])('[<5ms] writes %j as %s', (refs, expected) => {
		expect(proposalScope(refs)).toBe(expected);
	});
});
