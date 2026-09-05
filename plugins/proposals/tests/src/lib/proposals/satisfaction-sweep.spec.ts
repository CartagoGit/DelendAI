import { describe, expect, it } from 'vitest';

import type { ISliceObservation } from '../../../../src/lib/proposals/satisfaction-evaluator';
import {
	MARK_DONE_CONFIDENCE,
	sweepSatisfaction,
	type ISweepInput,
} from '../../../../src/lib/proposals/satisfaction-sweep';
import { WITHHOLD_CONFIDENCE_FLOOR } from '../../../../src/lib/auto-work/reconcile-before-dispatch';

const observation = (
	partial: Partial<ISliceObservation> = {},
): ISliceObservation => ({
	sliceId: 'S1',
	declaredStatus: 'pending',
	trackedFiles: ['a/src/x.ts'],
	missingFiles: [],
	unresolvableFiles: [],
	coveringTests: ['a/tests/x.spec.ts'],
	citedCommits: ['abc1234'],
	...partial,
});

const input = (
	proposalId: string,
	partial: Partial<ISliceObservation> = {},
): ISweepInput => ({ proposalId, observation: observation(partial) });

describe('satisfaction sweep (f00505 S3)', () => {
	describe('it reports divergence and nothing else', () => {
		it('finds a slice declared pending whose work has landed', () => {
			const report = sweepSatisfaction([input('x00419')]);

			expect(report.findings).toHaveLength(1);
			expect(report.findings[0]?.proposalId).toBe('x00419');
			expect(report.findings[0]?.declared).toBe('pending');
			expect(report.findings[0]?.observed).toBe('likely-done');
		});

		it('says nothing when the board agrees with the tree', () => {
			const report = sweepSatisfaction([
				input('f00001', {
					trackedFiles: [],
					missingFiles: ['a/src/new.ts'],
				}),
			]);

			expect(report.findings).toEqual([]);
			expect(report.summary).toContain('nothing declared differs');
		});

		it('reports how many it looked at, not just what it found', () => {
			const report = sweepSatisfaction([
				input('a'),
				input('b', {
					sliceId: 'S2',
					trackedFiles: [],
					missingFiles: ['x.ts'],
				}),
			]);

			expect(report.scanned).toBe(2);
			expect(report.findings).toHaveLength(1);
		});
	});

	describe('it proposes and never applies', () => {
		it('is read-only by construction', () => {
			// A sweep that transitioned slices itself would act on the
			// weakest evidence in the system, across many slices at once,
			// turning one systematic evaluator error into a board-wide
			// rewrite nobody asked for.
			expect(sweepSatisfaction([input('a')]).readOnly).toBe(true);
		});

		it('says plainly that nothing was changed', () => {
			expect(sweepSatisfaction([input('a')]).summary).toContain(
				'Nothing was changed',
			);
		});

		it('suggests closing only with both corroborations', () => {
			const strong = sweepSatisfaction([input('a')]);
			const weak = sweepSatisfaction([input('b', { citedCommits: [] })]);

			expect(strong.findings[0]?.suggested).toBe('mark-done');
			expect(weak.findings[0]?.suggested).toBe('verify-then-decide');
		});

		it('carries the evidence next to the suggestion', () => {
			const report = sweepSatisfaction([input('a')]);

			expect(report.findings[0]?.evidence.length).toBeGreaterThan(0);
			expect(report.findings[0]?.evidence.join(' ')).toContain(
				'a/src/x.ts',
			);
		});
	});

	describe('it cannot disagree with what dispatch would do', () => {
		it('uses the same confidence bar the reconciler withholds at', () => {
			// Two different bars would let the board recommend closing a
			// slice that dispatch still hands out, with no way for a
			// reader to tell which was wrong.
			expect(MARK_DONE_CONFIDENCE).toBe(WITHHOLD_CONFIDENCE_FLOOR);
		});
	});

	describe('attention goes where the evidence is strongest', () => {
		it('orders findings by confidence, highest first', () => {
			const report = sweepSatisfaction([
				input('weak', {
					sliceId: 'S1',
					citedCommits: [],
					coveringTests: [],
					missingFiles: ['b.ts'],
				}),
				input('strong', { sliceId: 'S2' }),
				input('middle', { sliceId: 'S3', citedCommits: [] }),
			]);

			const confidences = report.findings.map(
				(finding) => finding.confidence,
			);
			expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
			expect(report.findings[0]?.proposalId).toBe('strong');
		});
	});

	describe('degenerate input', () => {
		it('handles an empty board', () => {
			const report = sweepSatisfaction([]);

			expect(report.findings).toEqual([]);
			expect(report.scanned).toBe(0);
		});

		it('ignores a slice that is not pending', () => {
			expect(
				sweepSatisfaction([input('a', { declaredStatus: 'done' })])
					.findings,
			).toEqual([]);
		});

		it('ignores a slice nothing checkable can be said about', () => {
			expect(
				sweepSatisfaction([
					input('a', {
						trackedFiles: [],
						missingFiles: [],
						unresolvableFiles: ['packages/**'],
					}),
				]).findings,
			).toEqual([]);
		});
	});
});
