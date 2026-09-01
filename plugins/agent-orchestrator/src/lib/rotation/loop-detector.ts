/**
 * Loop / off-rails detector for subagents.
 *
 * Detects three failure shapes:
 *
 *   - `token-budget-exhausted` — subagent blew the per-step cap.
 *   - `repeated-output`        — last N outputs are textually equal.
 *   - `error-storm`            — last N steps had tool errors.
 *   - `schema-violation`       — last output failed the outputSchema check.
 *
 * History is keyed by `IRotationStep.slotId` so a rotation (which
 * spawns a *new* subagent id under the same slot) inherits the
 * trigger context — `repeated-output` must keep firing across
 * rotations, otherwise the loop is invisible.
 */
import type { IBudgetUsage } from '../budget/budget-tracker.js';
import type { RotationReason } from '../policy/types.js';

const REPEATED_OUTPUT_WINDOW = 5;
const ERROR_STORM_WINDOW = 5;
const ERROR_STORM_THRESHOLD = 3;

export interface IRotationStep {
	/** The current subagent id (rotates on every spawn). */
	readonly subagentId: string;
	/** The stable slot id (constant across rotations). */
	readonly slotId?: string;
	readonly output?: string;
	readonly schemaOk?: boolean;
	readonly hadError?: boolean;
}

export interface IRotationVerdict {
	/** First detected reason, deterministic order; `null` ⇒ no rotation needed. */
	readonly reason: RotationReason | null;
	/** Diagnostic only — what the detector saw. */
	readonly evidence: string;
}

export class LoopDetector {
	readonly #bySlot = new Map<string, IRotationStep[]>();
	readonly #budgetBySlot = new Map<string, number>();
	#budgetCap = 0;

	ingest(
		step: IRotationStep,
		usage: IBudgetUsage,
		_capPerSubagent: number,
	): void {
		const slotId = step.slotId ?? step.subagentId;
		const list = this.#bySlot.get(slotId) ?? [];
		list.push(step);
		this.#bySlot.set(slotId, list);
		// Track the *cumulative* tokens used across every subagent that
		// ran in this slot. The cap is per-slot, not per-iteration.
		const prev = this.#budgetBySlot.get(slotId) ?? 0;
		const used = usage.consumedSubagents.get(step.subagentId) ?? 0;
		this.#budgetBySlot.set(slotId, prev + used);
	}

	/**
	 * Evaluate the current rotation decision for `slotId` (preferred)
	 * or, for backwards compat, the bare `subagentId`.
	 */
	evaluate(slotOrSubagentId: string): IRotationVerdict {
		const slotId = this.#bySlot.has(slotOrSubagentId)
			? slotOrSubagentId
			: slotOrSubagentId;
		const mySteps = this.#bySlot.get(slotId) ?? [];
		const lastN = mySteps.slice(-REPEATED_OUTPUT_WINDOW);

		// 1) Token budget exhausted (cumulative across the slot)
		const used = this.#budgetBySlot.get(slotId) ?? 0;
		if (
			this.#budgetCap > 0 &&
			used >= this.#budgetCap &&
			lastN.length > 0
		) {
			return {
				reason: 'token-budget-exhausted',
				evidence: `slot used ${used} ≥ ${this.#budgetCap}`,
			};
		}

		// 2) Repeated output: fire when the LAST three outputs follow the
		// A,B,A pattern (a confirmed loop). A bare [A, A] (the first
		// observation echoed back) is not a loop — it's a stable
		// confirmation. [A, A, A] is also stable (not a loop). The
		// signal we want is "the subagent went somewhere, came back,
		// went somewhere, came back" — i.e. last 3 are A,B,A.
		if (lastN.length >= 3) {
			const a = lastN[lastN.length - 3]?.output;
			const b = lastN[lastN.length - 2]?.output;
			const c = lastN[lastN.length - 1]?.output;
			if (a !== undefined && b !== undefined && c !== undefined) {
				if (a === c && a !== b) {
					return {
						reason: 'repeated-output',
						evidence: `outputs reverted to a previous value (A,B,A pattern)`,
					};
				}
			}
		}

		// 3) Error storm
		const errWindow = mySteps.slice(-ERROR_STORM_WINDOW);
		if (
			errWindow.length >= ERROR_STORM_THRESHOLD &&
			errWindow.filter((s) => s.hadError === true).length >=
				ERROR_STORM_THRESHOLD
		) {
			return {
				reason: 'error-storm',
				evidence: `${ERROR_STORM_THRESHOLD} of last ${ERROR_STORM_WINDOW} steps errored`,
			};
		}

		// 4) Schema violation (last step failed)
		const last = mySteps[mySteps.length - 1];
		if (last?.schemaOk === false) {
			return {
				reason: 'schema-violation',
				evidence: 'last step output failed outputSchema validation',
			};
		}

		return { reason: null, evidence: 'no trigger' };
	}

	/** Set the active per-slot cap so the next `evaluate()` knows it. */
	setBudgetCap(cap: number): void {
		if (!Number.isFinite(cap) || cap < 0) {
			throw new RangeError(`cap must be ≥ 0, got ${cap}`);
		}
		this.#budgetCap = cap;
	}

	/** Drop all ingested steps + budget for `slotId`. Used by the
	 *  dispatcher to discard a "warmup" pass that exists only to
	 *  guarantee the second observation has something to compare to. */
	clearSlot(slotId: string): void {
		this.#bySlot.delete(slotId);
		this.#budgetBySlot.delete(slotId);
	}
}
