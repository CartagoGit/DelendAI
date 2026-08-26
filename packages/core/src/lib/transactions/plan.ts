/**
 * transactions/plan.ts — f00201 (Track O / q00006 §55).
 *
 * `plan()` is the pure half of the transaction module. It takes
 * an array of steps and returns an immutable descriptor — no I/O,
 * no clock, no side effects. The executor (`execute()`) consumes
 * the descriptor.
 *
 * Validations enforced at `plan()` time (so failures surface at
 * composition, not execution):
 *   - every step has a non-empty `name`;
 *   - every step has a `run` function;
 *   - every step has an `effects` array (allowed to be empty for
 *     read-only steps);
 *   - every step declares `compensable` as a boolean (so a missing
 *     field cannot silently default to `false` and skip
 *     compensation by accident);
 *   - step names are unique (the executor records compensation
 *     ledger entries by index; duplicate names would confuse the
 *     LLM trace).
 *
 * `execute()` lives in `executor.ts`. The compensation logic lives
 * in `compensate.ts`. Types live in `types.ts`.
 */

import type {
	IExecuteOptions,
	IStep,
	ITransactionPlan,
	ITransactionResult,
} from './types';

/**
 * Validate a single step. Returns the first issue found, or
 * `null` if the step is well-formed. Pure.
 */
const validateStep = <T>(step: IStep<T>, index: number): string | null => {
	if (step === null || typeof step !== 'object') {
		return `steps[${index}] is not an object`;
	}
	if (typeof step.name !== 'string' || step.name.length === 0) {
		return `steps[${index}].name must be a non-empty string`;
	}
	if (typeof step.run !== 'function') {
		return `steps[${index}] (${step.name ?? '<unnamed>'}): run must be a function`;
	}
	if (!Array.isArray(step.effects)) {
		return `steps[${index}] (${step.name}): effects must be an array (use [] for read-only steps)`;
	}
	if (typeof step.compensable !== 'boolean') {
		return `steps[${index}] (${step.name}): compensable must be a boolean`;
	}
	if (
		step.compensate !== undefined &&
		typeof step.compensate !== 'function'
	) {
		return `steps[${index}] (${step.name}): compensate must be a function when present`;
	}
	return null;
};

/**
 * Build an immutable descriptor for a transaction. Throws on the
 * first structural issue so a typo surfaces at composition, not
 * at execution. The returned object is deep-frozen so a caller
 * cannot mutate the plan between `plan()` and `execute()`.
 */
export const plan = <T>(steps: readonly IStep<T>[]): ITransactionPlan<T> => {
	if (!Array.isArray(steps)) {
		throw new TypeError('plan(): steps must be an array');
	}
	const seenNames = new Set<string>();
	for (const [index, step] of steps.entries()) {
		const issue = validateStep(step, index);
		if (issue !== null) {
			throw new TypeError(`plan(): ${issue}`);
		}
		if (seenNames.has(step.name)) {
			throw new TypeError(
				`plan(): duplicate step name "${step.name}" at index ${index}`,
			);
		}
		seenNames.add(step.name);
	}
	// Deep-freeze: the array + each step object. `run` and
	// `compensate` are functions; freezing their containing object
	// is enough to make them effectively read-only from the
	// caller's perspective.
	const frozenSteps = steps.map((s) => Object.freeze({ ...s }));
	return Object.freeze({
		steps: Object.freeze(frozenSteps) as readonly IStep<T>[],
	});
};

/**
 * Compute the highest risk across the declared effects. Pure;
 * used by the executor for the result envelope and exposed so the
 * dry-run preview can render a single confirmation prompt.
 */
export const computePlanRisk = <T>(
	plan: ITransactionPlan<T>,
): 'low' | 'medium' | 'high' => {
	let risk: 'low' | 'medium' | 'high' = 'low';
	for (const step of plan.steps) {
		for (const effect of step.effects) {
			const candidate = effectToRisk(effect);
			if (candidate === 'high') return 'high';
			if (candidate === 'medium' && risk === 'low') risk = 'medium';
		}
	}
	return risk;
};

import { STEP_EFFECT_RISK, type StepEffect } from './types';

const effectToRisk = (effect: StepEffect): 'low' | 'medium' | 'high' => {
	const r = STEP_EFFECT_RISK[effect];
	// STEP_EFFECT_RISK is the closed mapping; an unknown effect
	// (shouldn't happen, but TS noUncheckedIndexedAccess) is
	// treated as the highest level — safer than ignoring.
	return r ?? 'high';
};

/**
 * Re-export the public types and options from this barrel so a
 * consumer can `import { plan, execute, type IStep, ... }` from a
 * single module path. Kept here (not in `types.ts`) because the
 * `types.ts` module is intentionally type-only and free of
 * `import type` cycles.
 */
export type {
	IExecuteOptions,
	IStep,
	IStepContext,
	ICompensationContext,
	ICompensationRecord,
	ITransactionError,
	ITransactionPlan,
	ITransactionResult,
	StepEffect,
	TTransactionRisk,
} from './types';

export type { IExecuteResult } from './executor';

import { execute as runExecute } from './executor';

/**
 * Run a previously-built plan. Pure entry point: a single
 * async function over an immutable plan. The executor decides
 * whether to actually invoke `step.run` based on `dryRun`.
 *
 * See `executor.ts` for the full algorithm.
 */
export const execute = <T>(
	plan: ITransactionPlan<T>,
	options: IExecuteOptions = {},
): Promise<ITransactionResult<T>> => runExecute(plan, options);
