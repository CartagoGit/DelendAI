/**
 * work-progress.service.spec.ts — the view is fed by the board, not by a
 * reader of its own.
 */
import { describe, expect, it } from 'vitest';

import { proposalsOfBoard } from './work-progress.service';

describe('proposalsOfBoard', () => {
	it('takes each slice with the status its document carries and its acceptance count', () => {
		expect(
			proposalsOfBoard({
				proposals: [
					{
						id: 'f00002',
						title: 'Second',
						slices: [
							{
								sliceId: 'S1',
								status: 'pending',
								written: 'review',
								acceptance: 3,
							},
						],
					},
					{
						id: 'f00001',
						slices: [{ sliceId: 'S1', status: 'done' }],
					},
				],
			}),
		).toEqual([
			{
				id: 'f00001',
				title: '(untitled)',
				slices: [{ id: 'S1', status: 'done', acceptanceCount: 0 }],
			},
			{
				id: 'f00002',
				title: 'Second',
				slices: [{ id: 'S1', status: 'review', acceptanceCount: 3 }],
			},
		]);
	});

	it('is empty for a board with nothing open', () => {
		expect(proposalsOfBoard({})).toEqual([]);
		expect(proposalsOfBoard({ proposals: [{ id: 'q00001' }] })).toEqual([
			{ id: 'q00001', title: '(untitled)', slices: [] },
		]);
	});
});
