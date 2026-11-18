/**
 * work-revalidate.service.spec.ts — which proposals the batch selects,
 * and that it prints before it changes anything.
 */
import { describe, expect, it } from 'vitest';

import {
	parseRevalidateProposal,
	revalidateBatch,
	selectRevalidation,
} from './work-revalidate.service';
import type {
	IRevalidateProposal,
	IRevalidateSlice,
} from '../contracts/interfaces/work-revalidate.interface';

const slice = (over: Partial<IRevalidateSlice> = {}): IRevalidateSlice => ({
	id: 'S1',
	status: 'pending',
	shippedIn: 'abc123',
	reviewState: 'changes_requested',
	...over,
});

const proposal = (
	id: string,
	slices: readonly IRevalidateSlice[],
	stage = 'ready',
): IRevalidateProposal => ({ id, stage, slices });

const FIXTURE: readonly IRevalidateProposal[] = [
	proposal('f1', [slice(), slice({ id: 'S2' })]),
	proposal('f2', [slice(), slice({ id: 'S2', shippedIn: undefined })]),
	proposal('f3', [slice({ reviewState: 'in_review' })]),
	proposal('f4', [slice()], 'in-progress'),
	proposal('f5', [
		slice(),
		slice({ id: 'S2', status: 'retired', shippedIn: undefined }),
	]),
];

describe('selectRevalidation', () => {
	it('[<50ms] selects only the proposal whose live slices are all shipped and changes_requested', () => {
		expect(selectRevalidation(FIXTURE).chosen).toEqual(['f1', 'f5']);
	});

	it('[<50ms] leaves out a proposal with no live slice', () => {
		const none = [proposal('f6', [slice({ status: 'retired' })])];
		expect(selectRevalidation(none).chosen).toEqual([]);
	});

	it('[<50ms] reports a named proposal that fails the predicate and still selects the others', () => {
		const result = selectRevalidation(FIXTURE, ['f1', 'f2', 'f4', 'zz']);
		expect(result.chosen).toEqual(['f1']);
		expect(result.refused.map((entry) => entry.id)).toEqual([
			'f2',
			'f4',
			'zz',
		]);
		expect(result.refused[0]?.reason).toContain('S2 has no shipped-in');
		expect(result.refused[1]?.reason).toContain('not ready');
	});
});

describe('parseRevalidateProposal', () => {
	it('[<50ms] reads each slice status, shipped-in and review-state', () => {
		const text = [
			'---',
			'id: f9',
			'---',
			'## slices',
			'### S1 — one',
			'- **Status**: pending',
			'- shipped-in: `deadbeef`',
			'- review-state: changes_requested',
			'### S2 — two',
			'- **Status**: retired',
			'## acceptance',
			'### X — not a slice',
		].join('\n');
		expect(parseRevalidateProposal(text, 'ready')).toEqual({
			id: 'f9',
			stage: 'ready',
			slices: [
				{
					id: 'S1',
					status: 'pending',
					shippedIn: 'deadbeef',
					reviewState: 'changes_requested',
				},
				{
					id: 'S2',
					status: 'retired',
					shippedIn: undefined,
					reviewState: undefined,
				},
			],
		});
	});
});

describe('revalidateBatch', () => {
	const run = async (
		proposals: readonly IRevalidateProposal[],
		flag?: string,
	) => {
		const lines: string[] = [];
		const result = await revalidateBatch(
			{ proposals: async () => proposals, print: (l) => lines.push(l) },
			flag,
		);
		return { lines, result };
	};

	it('[<50ms] prints the chosen ids one per line', async () => {
		const { lines, result } = await run(FIXTURE);
		expect(lines).toEqual(['f1', 'f5']);
		expect(result.code).toBe(0);
	});

	it('[<50ms] says it chose none and exits 0 when nothing qualifies', async () => {
		const { lines, result } = await run([]);
		expect(lines).toEqual(['chose none']);
		expect(result.code).toBe(0);
	});

	it('[<50ms] reports a named proposal left out by id with its reason', async () => {
		const { lines } = await run(FIXTURE, 'f1,f3');
		expect(lines[0]).toContain('left out f3');
		expect(lines).toContain('f1');
	});
});
