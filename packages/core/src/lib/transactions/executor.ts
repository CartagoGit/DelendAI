/**
 * transactions/executor.ts — f00201 (Track O / q00006 §55).
 *
 * The runtime half of the workflow-transaction module. Walks a
 * frozen `ITransactionPlan`, calls `step.run` in plan order, and
 * on failure asks the compensation helper to undo everything that
 * already ran.
 *
 * Algorithm:
 *   1. Resolve `dryRun` (default false). Build the per-step ctx.
 *   2. For each step in plan order:
 *      a. If dryRun is true, do NOT call `step.run` — the whole
 *         point of the preview is to avoid executing side
 *         effects. The step's `name` is recorded as
 *         "would have run" so the LLM can see the plan.
 *         This mirrors `IDryRunResult` (f00189) where
 *         `wouldRun`/`wouldChange` describe the plan without
 *         executing it.
 *      b. Otherwise call `run(ctx)`, capture the value, append
 *         to the completed map.
 *      c. On error: run `compensateAll`, build the failure
 *         envelope, return.
 *   3. Build the success envelope.
 *
 * Privacy (R1.1–R1.10): the executor never logs, never reads the
 * clock, never writes to a sink. It returns a pure result envelope
 * that the caller (an LLM-facing tool handler) can choose to log
 * or surface verbatim. Step names and counters only.
 */

import { compensateAll } from './compensate';
import { computePlanRisk } from './plan';
import type {
	IExecuteOptions,
	IStep,
	IStepContext,
	ITransactionPlan,
	ITransactionResult,
} from './types';

/** Re-exported from `plan.ts` for the public barrel. */
export interface IExecuteResult<_T> {
	readonly ok: boolean;
	readonly totalSteps: number;
	readonly executedSteps: number;
}

/**
 * Run the plan. Returns an `ITransactionResult`. Never throws —
 * a failing step is captured into the result envelope so the
 * caller can render the trace to the LLM.
 */
export const execute = async <T>(
	plan: ITransactionPlan<T>,
	options: IExecuteOptions = {},
): Promise<ITransactionResult<T>> => {
	const dryRun = options.dryRun === true;
	const steps = plan.steps;
	const totalSteps = steps.length;
	const completed = new Map<number, T>();
	const executedStepNames: string[] = [];
	const risk = computePlanRisk(plan);

	for (const [index, step] of steps.entries()) {
		const ctx = buildStepContext({
			step,
			index,
			totalSteps,
			dryRun,
			completedValues: [...completed.values()],
		});

		if (dryRun) {
			// Preview only — never call `run`. The step's
			// `wouldRun` is captured by `executedStepNames` so the
			// LLM sees the plan without anything actually
			// happening in the world.
			executedStepNames.push(step.name);
			continue;
		}

		try {
			const value = await step.run(ctx);
			completed.set(index, value);
			executedStepNames.push(step.name);
		} catch (cause) {
			// The failing step "ran" in the sense that the executor
			// invoked it and it returned control via throw; record
			// it in the trace so the LLM sees the full plan.
			executedStepNames.push(step.name);
			const compensations = await compensateAll({
				steps,
				completed,
				failingStep: step.name,
				failingStepIndex: index,
				dryRun,
			});

			return Object.freeze({
				ok: false,
				values: Object.freeze([...completed.values()]) as readonly T[],
				compensations,
				risk,
				dryRun,
				executedSteps: executedStepNames.length,
				totalSteps,
				error: Object.freeze({
					step: step.name,
					stepIndex: index,
					cause,
				}),
				executedStepNames: Object.freeze(executedStepNames),
			}) satisfies ITransactionResult<T> as ITransactionResult<T>;
		}
	}

	return Object.freeze({
		ok: true,
		values: Object.freeze([...completed.values()]) as readonly T[],
		compensations: Object.freeze([]) as readonly [],
		risk,
		dryRun,
		executedSteps: executedStepNames.length,
		totalSteps,
		executedStepNames: Object.freeze(executedStepNames),
	}) satisfies ITransactionResult<T> as ITransactionResult<T>;
};

const buildStepContext = <T>(input: {
	readonly step: IStep<T>;
	readonly index: number;
	readonly totalSteps: number;
	readonly dryRun: boolean;
	readonly completedValues: readonly unknown[];
}): IStepContext =>
	Object.freeze({
		stepName: input.step.name,
		stepIndex: input.index,
		stepCount: input.totalSteps,
		dryRun: input.dryRun,
		priorValues: Object.freeze([...input.completedValues]),
	});
