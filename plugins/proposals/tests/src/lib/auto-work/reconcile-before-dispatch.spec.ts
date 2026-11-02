import { describe, expect, it } from 'vitest';

import {
	isWithheld,
	reconcileBeforeDispatch,
	WITHHOLD_CONFIDENCE_FLOOR,
	type IDispatchCandidate,
} from '../../../../src/lib/auto-work/reconcile-before-dispatch';
import { collectSliceObservation } from '../../../../src/lib/proposals/satisfaction-collector';
import {
	evaluateSliceSatisfaction,
	type ISatisfactionVerdict,
} from '../../../../src/lib/proposals/satisfaction-evaluator';

const candidate = (
	partial: Partial<IDispatchCandidate> = {},
): IDispatchCandidate => ({
	proposalId: 'x00419',
	sliceId: 'S7',
	proposalStatus: 'ready',
	...partial,
});

const trackedSet = (files: readonly string[]) => ({
	isTracked: async (file: string) => files.includes(file),
});

/** The real pipeline: collect, evaluate, decide. */
const decideFor = async (input: {
	readonly files: readonly string[];
	readonly tracked: readonly string[];
	readonly citedCommits?: readonly string[];
	readonly proposalStatus?: string;
	readonly declaredStatus?: string;
}) => {
	const observation = await collectSliceObservation(
		{
			sliceId: 'S7',
			declaredStatus: input.declaredStatus ?? 'pending',
			files: input.files,
			citedCommits: input.citedCommits ?? [],
		},
		trackedSet(input.tracked),
	);
	return reconcileBeforeDispatch(
		candidate(
			input.proposalStatus === undefined
				? {}
				: { proposalStatus: input.proposalStatus },
		),
		evaluateSliceSatisfaction(observation),
	);
};

const verdict = (
	partial: Partial<ISatisfactionVerdict> = {},
): ISatisfactionVerdict => ({
	sliceId: 'S7',
	declared: 'pending',
	observed: 'likely-done',
	confidence: 0.95,
	evidence: [
		{
			kind: 'commit-cited',
			supports: true,
			detail: 'shipped in abc1234',
		},
	],
	...partial,
});

describe('reconcile before dispatch (f00505 S2)', () => {
	describe('work that already landed is not handed out again', () => {
		it('withholds a slice whose code satisfies it, with both corroborations', async () => {
			// x00419 S7: implemented, committed, cited, with a spec — and
			// still sitting in `pending`, which is how an agent gets sent
			// to reimplement it.
			const outcome = await decideFor({
				files: [
					'plugins/commit-policy/src/lib/services/commit-driver.ts',
				],
				tracked: [
					'plugins/commit-policy/src/lib/services/commit-driver.ts',
					'plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts',
				],
				citedCommits: ['abc1234'],
			});

			expect(outcome.decision).toBe('withhold-already-satisfied');
			expect(isWithheld(outcome)).toBe(true);
		});

		it('says why it withheld and what evidence backs it', () => {
			const outcome = reconcileBeforeDispatch(candidate(), verdict());

			expect(outcome.reason).toContain('already satisfies');
			expect(outcome.reason).toContain('shipped in abc1234');
			expect(outcome.reason).toContain('Mark the slice done');
			expect(outcome.verdict?.confidence).toBe(0.95);
		});
	});

	describe('withholding is the mistake that hides work, so the bar is high', () => {
		it('does NOT withhold on a covering spec alone', async () => {
			// The counter-example that stopped the first attempt at this
			// slice: x00420 S1 declared a file that already existed and
			// already had a property spec beside it, and it was real,
			// unstarted work. Nearly every source file here has a spec.
			const outcome = await decideFor({
				files: ['packages/core/src/lib/shared/with-file-mutex.ts'],
				tracked: [
					'packages/core/src/lib/shared/with-file-mutex.ts',
					'packages/core/tests/src/lib/shared/with-file-mutex.spec.ts',
				],
			});

			expect(isWithheld(outcome)).toBe(false);
			expect(outcome.decision).toBe('dispatch-for-verification');
			expect(outcome.reason).toContain('below the 0.95');
		});

		it('asks for the commit citation that would settle it', async () => {
			const outcome = await decideFor({
				files: ['packages/core/src/lib/shared/with-file-mutex.ts'],
				tracked: [
					'packages/core/src/lib/shared/with-file-mutex.ts',
					'packages/core/tests/src/lib/shared/with-file-mutex.spec.ts',
				],
			});

			expect(outcome.reason).toContain('cite the commit');
		});

		it('never withholds below the floor, whatever the verdict claims', () => {
			for (const confidence of [0, 0.25, 0.5, 0.75, 0.9499]) {
				const outcome = reconcileBeforeDispatch(
					candidate(),
					verdict({ confidence }),
				);
				expect(isWithheld(outcome)).toBe(false);
			}
			expect(
				isWithheld(
					reconcileBeforeDispatch(
						candidate(),
						verdict({ confidence: WITHHOLD_CONFIDENCE_FLOOR }),
					),
				),
			).toBe(true);
		});
	});

	describe('an ambiguous slice is verified, not implemented and not withheld', () => {
		it('dispatches for verification when only some declared files exist', async () => {
			const outcome = await decideFor({
				files: ['a/src/here.ts', 'a/src/gone.ts'],
				tracked: ['a/src/here.ts'],
			});

			expect(outcome.decision).toBe('dispatch-for-verification');
			expect(outcome.reason).toContain('before writing anything');
		});

		it('dispatches ordinary work when nothing exists yet', async () => {
			const outcome = await decideFor({
				files: ['a/src/new.ts'],
				tracked: [],
			});

			expect(outcome.decision).toBe('dispatch');
			expect(outcome.reason).toContain('none of the declared files');
		});

		it('dispatches a slice it cannot judge at all', async () => {
			// Declared as a glob: nothing checkable. Silence must mean
			// "offer it", never "hold it back".
			const outcome = await decideFor({
				files: ['packages/**/tests/**'],
				tracked: [],
			});

			expect(outcome.decision).toBe('dispatch');
			expect(isWithheld(outcome)).toBe(false);
		});

		it('dispatches when there is no verdict at all', () => {
			const outcome = reconcileBeforeDispatch(candidate());

			expect(outcome.decision).toBe('dispatch');
			expect(outcome.reason).toContain('could not be observed');
			expect(outcome.verdict).toBeUndefined();
		});
	});

	describe('an archived or frozen proposal is never reconciled', () => {
		for (const proposalStatus of ['done', 'retired', 'blocked', 'paused']) {
			it(`leaves a "${proposalStatus}" proposal alone even when the slice looks satisfied`, () => {
				const outcome = reconcileBeforeDispatch(
					candidate({ proposalStatus }),
					verdict(),
				);

				expect(isWithheld(outcome)).toBe(false);
				expect(outcome.reason).toContain(
					'which reconciliation never inspects',
				);
			});
		}

		it('still reconciles an in-progress proposal', () => {
			const outcome = reconcileBeforeDispatch(
				candidate({ proposalStatus: 'in-progress' }),
				verdict(),
			);

			expect(isWithheld(outcome)).toBe(true);
		});
	});

	describe("a slice that is not pending is nobody's business here", () => {
		it('is dispatched rather than judged', async () => {
			const outcome = await decideFor({
				files: ['a/src/here.ts'],
				tracked: ['a/src/here.ts'],
				declaredStatus: 'done',
			});

			expect(isWithheld(outcome)).toBe(false);
		});
	});
});
