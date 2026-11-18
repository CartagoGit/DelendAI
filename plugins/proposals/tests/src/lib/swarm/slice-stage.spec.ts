/**
 * slice-stage.spec.ts — one slice per stage, read from recorded facts.
 */
import { describe, expect, it } from 'vitest';

import {
	sliceStage,
	stageCounts,
	type ISliceFacts,
} from '@delendai/proposals/lib/swarm/slice-stage';

const facts = (over: Partial<ISliceFacts>): ISliceFacts => ({
	status: 'pending',
	reviewState: 'none',
	delivered: false,
	proved: false,
	integrated: false,
	released: false,
	...over,
});

describe('sliceStage', () => {
	it.each([
		['pending', facts({})],
		['in-progress', facts({ status: 'in-progress' })],
		['implemented', facts({ delivered: true })],
		['proved', facts({ delivered: true, proved: true })],
		[
			'in_review',
			facts({
				status: 'review',
				reviewState: 'in_review',
				delivered: true,
			}),
		],
		[
			'changes_requested',
			facts({ reviewState: 'changes_requested', delivered: true }),
		],
		['reviewed', facts({ status: 'done', reviewState: 'done' })],
		[
			'integrated',
			facts({ status: 'done', reviewState: 'done', integrated: true }),
		],
		[
			'released',
			facts({
				status: 'done',
				reviewState: 'done',
				integrated: true,
				released: true,
			}),
		],
		['retired', facts({ status: 'retired', released: true })],
	] as const)('reads %s', (stage, given) => {
		expect(sliceStage(given)).toBe(stage);
	});

	it('reads a slice awaiting review as in_review, not pending', () => {
		// Handed in with no round yet: its Status says review.
		expect(sliceStage(facts({ status: 'review' }))).toBe('in_review');
		// Merged before its review, as a slice lands here: still awaiting it.
		expect(
			sliceStage(
				facts({
					reviewState: 'in_review',
					delivered: true,
					integrated: true,
				}),
			),
		).toBe('in_review');
	});

	it('counts the stages present', () => {
		expect(stageCounts(['in_review', 'pending', 'in_review'])).toBe(
			'in_review 2, pending 1',
		);
	});
});
