/**
 * plan-blocks.spec.ts — a plan's `contains:` and `closureGate:` blocks
 * read into their typed shape.
 */
import { describe, expect, it } from 'vitest';

import { planBlocks } from '@delendai/proposals/lib/proposals/plan-blocks';

describe('planBlocks', () => {
	it('reads bare ids and entries, and drops the ones without an id', () => {
		expect(
			planBlocks({
				contains: {
					proposals: [
						'f00001',
						7,
						{
							id: 'x00002',
							kind: 'fix',
							required: true,
							title: 'T',
						},
					],
					audits: [{ id: ' ' }, null, ['nested'], 'a00095'],
				},
			}),
		).toEqual({
			contains: {
				proposals: [
					{ id: 'f00001' },
					{ id: '7' },
					{ id: 'x00002', kind: 'fix', required: true, title: 'T' },
				],
				audits: [{ id: 'a00095' }],
			},
		});
	});

	it('keeps only the boolean closure flags it knows', () => {
		expect(
			planBlocks({
				closureGate: {
					requirePeerReview: true,
					requireAllSlicesDone: 'yes',
					requireAllChildrenDone: false,
					requireDevelopGreen: true,
				},
			}),
		).toEqual({
			closureGate: {
				requirePeerReview: true,
				requireAllChildrenDone: false,
			},
		});
	});

	it('returns nothing for a document without the blocks or with a list in their place', () => {
		expect(planBlocks({ title: 'x' })).toEqual({});
		expect(planBlocks({ contains: ['f00001'], closureGate: null })).toEqual(
			{},
		);
	});
});
