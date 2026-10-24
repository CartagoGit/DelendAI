import { describe, expect, it } from 'vitest';

import {
	collectSliceObservation,
	conventionalSpecPaths,
} from '../../../../src/lib/proposals/satisfaction-collector';
import { evaluateSliceSatisfaction } from '../../../../src/lib/proposals/satisfaction-evaluator';

const trackedSet = (files: readonly string[]) => ({
	isTracked: async (file: string) => files.includes(file),
});

describe('satisfaction collector (f00505 S2)', () => {
	describe('conventionalSpecPaths', () => {
		it('looks beside the file and in the mirrored tests tree', () => {
			expect(conventionalSpecPaths('plugins/x/src/lib/a/b.ts')).toEqual([
				'plugins/x/src/lib/a/b.spec.ts',
				'plugins/x/tests/src/lib/a/b.spec.ts',
			]);
		});

		it('has no opinion about a non-TypeScript file', () => {
			expect(conventionalSpecPaths('docs/readme.md')).toEqual([]);
		});
	});

	describe('collectSliceObservation', () => {
		it('separates tracked, missing and unjudgeable entries', async () => {
			const observation = await collectSliceObservation(
				{
					sliceId: 'S1',
					declaredStatus: 'pending',
					files: [
						'a/src/here.ts',
						'a/src/gone.ts',
						'packages/**/tests/**',
					],
					citedCommits: [],
				},
				trackedSet(['a/src/here.ts']),
			);

			expect(observation.trackedFiles).toEqual(['a/src/here.ts']);
			expect(observation.missingFiles).toEqual(['a/src/gone.ts']);
			expect(observation.unresolvableFiles).toEqual([
				'packages/**/tests/**',
			]);
		});

		it('finds a covering spec in the mirrored tests tree', async () => {
			const observation = await collectSliceObservation(
				{
					sliceId: 'S1',
					declaredStatus: 'pending',
					files: ['plugins/x/src/lib/a.ts'],
					citedCommits: [],
				},
				trackedSet([
					'plugins/x/src/lib/a.ts',
					'plugins/x/tests/src/lib/a.spec.ts',
				]),
			);

			expect(observation.coveringTests).toEqual([
				'plugins/x/tests/src/lib/a.spec.ts',
			]);
		});

		it('reports no covering test rather than guessing one', async () => {
			const observation = await collectSliceObservation(
				{
					sliceId: 'S1',
					declaredStatus: 'pending',
					files: ['plugins/x/src/lib/a.ts'],
					citedCommits: [],
				},
				trackedSet(['plugins/x/src/lib/a.ts']),
			);

			expect(observation.coveringTests).toEqual([]);
		});
	});

	describe('end to end, on the shape that motivated this', () => {
		it('a shipped slice with a spec beside it reads as likely-done', async () => {
			// This is x00419 S7: one declared `.ts` that exists, is
			// tracked, is committed and clean. The pre-existing
			// `hasPendingArtifactChange` guard sees a clean file and lets
			// the slice be dispatched, which is how an agent gets sent to
			// reimplement work that already landed.
			const observation = await collectSliceObservation(
				{
					sliceId: 'S7',
					declaredStatus: 'pending',
					files: [
						'plugins/commit-policy/src/lib/services/commit-driver.ts',
					],
					citedCommits: ['abc1234'],
				},
				trackedSet([
					'plugins/commit-policy/src/lib/services/commit-driver.ts',
					'plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts',
				]),
			);

			const verdict = evaluateSliceSatisfaction(observation);

			expect(verdict.observed).toBe('likely-done');
			expect(verdict.confidence).toBe(0.95);
		});

		it('a slice about to be worked on still reads as needing work', async () => {
			// The file exists because the agent is about to edit it. That
			// must never be enough to withhold the slice.
			const observation = await collectSliceObservation(
				{
					sliceId: 'S1',
					declaredStatus: 'pending',
					files: ['packages/core/src/lib/a.ts'],
					citedCommits: [],
				},
				trackedSet(['packages/core/src/lib/a.ts']),
			);

			expect(evaluateSliceSatisfaction(observation).observed).toBe(
				'verification-needed',
			);
		});

		it('a spec beside an existing file is NOT enough to withhold a slice', async () => {
			// The counter-example that stopped S2 from landing: x00420 S1
			// declares `with-file-mutex.ts`, which already existed and
			// already had a property spec beside it. On a covering spec
			// alone this reads `likely-done` — and that slice was real,
			// unstarted work. Most source files in this repo have a spec,
			// so a spec cannot distinguish "already implemented" from
			// "about to modify something well tested".
			//
			// The verdict below is therefore documented, not endorsed: a
			// consumer must require the cited-commit corroboration too
			// before acting on it.
			const observation = await collectSliceObservation(
				{
					sliceId: 'S1',
					declaredStatus: 'pending',
					files: ['packages/core/src/lib/shared/with-file-mutex.ts'],
					citedCommits: [],
				},
				trackedSet([
					'packages/core/src/lib/shared/with-file-mutex.ts',
					'packages/core/tests/src/lib/shared/with-file-mutex.spec.ts',
				]),
			);
			const verdict = evaluateSliceSatisfaction(observation);

			expect(verdict.observed).toBe('likely-done');
			expect(verdict.confidence).toBe(0.75);
			// Strictly below the both-signals bar a consumer must clear.
			expect(verdict.confidence).toBeLessThan(0.95);
		});
	});
});
