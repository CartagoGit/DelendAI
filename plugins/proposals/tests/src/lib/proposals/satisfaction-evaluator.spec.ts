import { describe, expect, it } from 'vitest';

import {
	collectDivergences,
	evaluateSliceSatisfaction,
	type ISliceObservation,
} from '../../../../src/lib/proposals/satisfaction-evaluator';

const observation = (
	partial: Partial<ISliceObservation> = {},
): ISliceObservation => ({
	sliceId: 'S1',
	declaredStatus: 'pending',
	trackedFiles: [],
	missingFiles: [],
	unresolvableFiles: [],
	coveringTests: [],
	citedCommits: [],
	...partial,
});

describe('satisfaction evaluator (f00505 S1)', () => {
	describe('what it refuses to conclude', () => {
		it('a slice with nothing checkable is unknown, never done', () => {
			// The rule that keeps this honest: absence of evidence is not
			// evidence of completion.
			const verdict = evaluateSliceSatisfaction(
				observation({ unresolvableFiles: ['packages/**/tests/**'] }),
			);

			expect(verdict.observed).toBe('unknown');
			expect(verdict.confidence).toBe(0);
		});

		it('a slice that is not pending is not reconciled at all', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({
					declaredStatus: 'done',
					trackedFiles: ['a/b.ts'],
					coveringTests: ['a/b.spec.ts'],
					citedCommits: ['abc1234'],
				}),
			);

			expect(verdict.observed).toBe('unknown');
		});

		it('tracked files alone are never enough for likely-done', () => {
			// A slice legitimately declares a file it is ABOUT to modify,
			// so existence on its own says nothing about completion. This
			// is exactly where `lint:proposal-already-implemented` stops,
			// and why its 78 findings are suspicion rather than verdicts.
			const verdict = evaluateSliceSatisfaction(
				observation({ trackedFiles: ['a/b.ts', 'a/c.ts'] }),
			);

			expect(verdict.observed).toBe('verification-needed');
			expect(verdict.confidence).toBeLessThan(0.75);
		});
	});

	describe('what it does conclude', () => {
		it('all files tracked plus a covering test is likely-done', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({
					trackedFiles: ['a/b.ts'],
					coveringTests: ['a/b.spec.ts'],
				}),
			);

			expect(verdict.observed).toBe('likely-done');
			expect(verdict.confidence).toBe(0.75);
		});

		it('a covering test AND a cited commit raise the confidence', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({
					trackedFiles: ['a/b.ts'],
					coveringTests: ['a/b.spec.ts'],
					citedCommits: ['abc1234'],
				}),
			);

			expect(verdict.observed).toBe('likely-done');
			expect(verdict.confidence).toBe(0.95);
		});

		it('nothing on disk yet is not-started', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({ missingFiles: ['a/b.ts'] }),
			);

			expect(verdict.observed).toBe('not-started');
		});

		it('a partially landed slice needs verification, not dispatch', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({
					trackedFiles: ['a/b.ts'],
					missingFiles: ['a/c.ts'],
					coveringTests: ['a/b.spec.ts'],
				}),
			);

			expect(verdict.observed).toBe('verification-needed');
			expect(verdict.confidence).toBe(0.25);
		});
	});

	describe('evidence', () => {
		it('every verdict can be checked by hand', () => {
			const verdict = evaluateSliceSatisfaction(
				observation({
					trackedFiles: ['a/b.ts'],
					missingFiles: ['a/c.ts'],
					coveringTests: ['a/b.spec.ts'],
					citedCommits: ['abc1234'],
				}),
			);

			expect(verdict.evidence.map((e) => e.kind)).toEqual([
				'files-tracked',
				'files-missing',
				'tests-covering',
				'commit-cited',
			]);
			expect(
				verdict.evidence.find((e) => e.kind === 'files-missing')
					?.supports,
			).toBe(false);
			expect(
				verdict.evidence.find((e) => e.kind === 'commit-cited')?.detail,
			).toContain('abc1234');
		});
	});

	describe('collectDivergences', () => {
		it('reports only slices whose declared and observed states disagree', () => {
			const divergences = collectDivergences([
				observation({ sliceId: 'S1', missingFiles: ['a/a.ts'] }),
				observation({
					sliceId: 'S2',
					trackedFiles: ['a/b.ts'],
					coveringTests: ['a/b.spec.ts'],
				}),
				observation({ sliceId: 'S3', trackedFiles: ['a/c.ts'] }),
			]);

			// S1 has not started — that is a slice waiting its turn, not a
			// divergence, and reporting it would drown the real signal.
			expect(divergences.map((d) => d.sliceId)).toEqual(['S2', 'S3']);
		});

		it('orders by confidence so the clearest cases come first', () => {
			const divergences = collectDivergences([
				observation({ sliceId: 'weak', trackedFiles: ['a/a.ts'] }),
				observation({
					sliceId: 'strong',
					trackedFiles: ['a/b.ts'],
					coveringTests: ['a/b.spec.ts'],
					citedCommits: ['abc1234'],
				}),
			]);

			expect(divergences[0]?.sliceId).toBe('strong');
		});
	});
});
