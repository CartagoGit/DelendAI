/**
 * transactions/compensate.ts — f00201 (Track O / q00006 §55).
 *
 * Compensation half of the executor. When a step in the middle of
 * a plan fails, the executor walks the *previously completed*
 * steps in reverse order and asks each one to undo its work.
 *
 * Design notes (SRP + privacy):
 *   - This file is pure: it has no I/O, no clock, no log sink.
 *     The executor passes everything in by argument.
 *   - A failing compensation is recorded but does NOT abort the
 *     chain. We compensate *every* completed step so a later
 *     undo can clean up state left behind by an earlier failed
 *     undo. Surfacing the failure in the ledger lets a human /
 *     LLM triage.
 *   - In dryRun mode, we never call `compensate`; we record
 *     `skippedReason: 'dry-run'` instead. The dry-run contract is
 *     "no observable effect on the world" — that includes no
 *     effect from the compensation path.
 *   - A step declared `compensable: false` is recorded as
 *     `skippedReason: 'not-compensable'`. The executor still
 *     emits a record so the LLM sees that we considered the
 *     compensation and chose not to run it.
 */

import type { ICompensationContext, ICompensationRecord, IStep } from './types';

export interface ICompensateInput<T> {
	/** Steps in plan order. The executor picks the slice to walk. */
	readonly steps: readonly IStep<T>[];
	/** Map of stepIndex → value produced by the forward run. */
	readonly completed: ReadonlyMap<number, T>;
	/** Name of the step whose failure triggered compensation. */
	readonly failingStep: string;
	/** Index of the step whose failure triggered compensation. */
	readonly failingStepIndex: number;
	/** Whether the executor is in dryRun mode. */
	readonly dryRun: boolean;
}

/**
 * Walk the completed steps in reverse plan order and call each
 * one's `compensate()`. Always returns an entry per considered
 * step — never throws — so the executor can render the ledger
 * even when an undo itself blew up.
 */
export const compensateAll = async <T>(
	input: ICompensateInput<T>,
): Promise<readonly ICompensationRecord[]> => {
	const { steps, completed, failingStep, failingStepIndex, dryRun } = input;
	const records: ICompensationRecord[] = [];

	// Walk completed steps in reverse plan order. The completed
	// map only contains successful steps, so iterating its keys
	// in descending order is the canonical "undo last thing first".
	const indices = [...completed.keys()].sort((a, b) => b - a);

	for (const index of indices) {
		const step = steps[index];
		if (step === undefined) {
			// Shouldn't happen — completed is a subset of steps.
			// Defensive record so the ledger stays complete.
			records.push({
				stepName: '<unknown>',
				stepIndex: index,
				compensable: false,
				skipped: true,
				ok: false,
				error: new Error(`steps[${index}] missing from plan`),
				skippedReason: 'not-compensable',
			});
			continue;
		}

		const prior = completed.get(index);
		if (prior === undefined) {
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: step.compensable,
				skipped: true,
				ok: false,
				error: new Error(
					`completed map missing entry for step ${index}`,
				),
				skippedReason: step.compensable
					? 'no-handler'
					: 'not-compensable',
			});
			continue;
		}

		if (dryRun) {
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: step.compensable,
				skipped: true,
				ok: true,
				skippedReason: 'dry-run',
			});
			continue;
		}

		if (!step.compensable) {
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: false,
				skipped: true,
				ok: true,
				skippedReason: 'not-compensable',
			});
			continue;
		}

		if (typeof step.compensate !== 'function') {
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: true,
				skipped: true,
				ok: true,
				skippedReason: 'no-handler',
			});
			continue;
		}

		const ctx: ICompensationContext = {
			stepName: step.name,
			stepIndex: index,
			failingStep,
			failingStepIndex,
			dryRun,
		};

		try {
			await step.compensate(ctx, prior);
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: true,
				skipped: false,
				ok: true,
			});
		} catch (error) {
			// Compensation failures are recorded, not thrown. We
			// want to attempt compensation on every completed
			// step so a later undo can clean up state left by an
			// earlier failed undo. The caller (executor) will
			// surface the ledger to the LLM.
			records.push({
				stepName: step.name,
				stepIndex: index,
				compensable: true,
				skipped: false,
				ok: false,
				error,
			});
		}
	}

	return Object.freeze(records);
};
