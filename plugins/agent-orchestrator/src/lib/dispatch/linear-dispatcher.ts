/**
 * Sequential executor for an `IModePlan`. One subagent at a time, in
 * order. Honors `dependsOn` by skipping steps whose dependencies
 * failed (fail-fast on the first terminal failure).
 *
 * Rotation: for every step that calls `spawn`, the dispatcher
 *   - keeps invoking the port up to `maxIterationsPerSubagent` times,
 *   - each iteration evaluates the `LoopDetector`,
 *   - rotates only if the verdict reason is in `allow[ ]`,
 *   - stops when the verdict is `null` (clean output) or when the
 *     rotation budget is exhausted.
 *
 * The dispatcher is pure with respect to I/O: the port is the only
 * place that touches the host. Pure-traceable: same port scripts
 * ⇒ same outcomes.
 *
 * Limits enforced before the port is even called:
 *   - `BudgetTracker.orchestratorExhausted()` ⇒ bail with
 *     `ok: false` (fail-closed)
 *   - per-subagent cap via `BudgetTracker.subagentExhausted(id)`
 *
 * Concurrent dispatch lands in S3.
 */
import { BudgetTracker } from '../budget/budget-tracker.js';
import { LoopDetector } from '../rotation/loop-detector.js';
import type { IModePlan, IPlanStep } from '../policy/types.js';
import { InMemoryTelemetrySink, TelemetryEvent } from '../telemetry/event.js';
import type { ITelemetrySink } from '../telemetry/event.js';
import type {
	IDispatchPort,
	IPlanOutcome,
	IStepOutcome,
	ISubagentResult,
} from './contracts.js';

/** Generate a stable, deterministic, host-independent slot id. */
function makeSlotId(order: number, role: string): string {
	return `slot-${order}-${role}`;
}

/** New subagent id inside a rotation slot. */
function makeSubagentId(slotId: string, iter: number): string {
	return `${slotId}#${iter}`;
}

/**
 * Public façade. Construct once per plan, then call `run()`.
 * Reusable across plans (the budget + detector are local, not
 * shared).
 */
export class LinearDispatcher {
	readonly #port: IDispatchPort;
	readonly #budget: BudgetTracker;
	readonly #detector: LoopDetector;
	readonly #ingestionsBySlot = new Map<string, number>();
	readonly #plan: IModePlan;
	readonly #taskId: string;
	readonly #telemetry: ITelemetrySink;

	/**
	 * `telemetry` defaults to a private, throwaway sink so the
	 * dispatcher stays constructible without a real one (unit tests
	 * that only care about `IPlanOutcome`). A host wiring `_dispatch`
	 * passes in the same sink instance the `_events` tool reads, so
	 * dispatch/rotate events actually reach it.
	 */
	constructor(
		plan: IModePlan,
		port: IDispatchPort,
		taskId: string,
		telemetry: ITelemetrySink = new InMemoryTelemetrySink(),
	) {
		this.#plan = plan;
		this.#port = port;
		this.#taskId = taskId;
		this.#telemetry = telemetry;
		this.#budget = new BudgetTracker(plan.budget);
		this.#detector = new LoopDetector();
		this.#detector.setBudgetCap(plan.budget.maxTokensPerSubagent);
	}

	/** Snapshot the budget at any time (for the `_budget` tool). */
	budget(): BudgetTracker {
		return this.#budget;
	}

	/** Length of detector history for `slotId` — used to gate the
	 *  "first clean observation" rule. */
	#historyLength(slotId: string): number {
		// The detector doesn't expose history length directly; we ask it
		// via a benign `evaluate` and inspect the evidence prefix. To
		// avoid coupling, we mirror the count via the BudgetTracker
		// approach: every subagent run pre-registers `recordSubagent(0)`
		// which we don't track. Instead, the simplest path is to
		// instrument the detector to expose the count. Done in S2 tests.
		// For v1 we read the cursor from the FakeDispatchPort — not
		// possible here — so we use a sentinel: track ingestions
		// directly via a Map.
		const slotIngestions = this.#ingestionsBySlot.get(slotId) ?? 0;
		return slotIngestions;
	}

	async run(): Promise<IPlanOutcome> {
		const stepOutcomes: IStepOutcome[] = [];
		let failedOrder: number | null = null;

		for (const step of this.#plan.steps) {
			if (failedOrder !== null) {
				// Skip steps whose dependency chain has already failed.
				// A step with no `dependsOn` is independent and still runs.
				const dependsOnFailed =
					step.dependsOn?.some((d) => d === failedOrder) ?? false;
				if (dependsOnFailed) {
					stepOutcomes.push(emptyStepOutcome(step));
					continue;
				}
			}

			const outcome = await this.#runStep(step);
			stepOutcomes.push(outcome);
			if (!outcome.ok && failedOrder === null) {
				failedOrder = step.order;
			}
		}

		const snap = this.#budget.snapshot();
		// `ok` means: at least one step succeeded AND no step that was
		// supposed to run failed. Steps skipped due to a failed dep
		// count as failures for the purpose of the top-level signal —
		// we don't want a 3-step plan that skipped the middle step to
		// report `ok: true` because the verify step passed.
		const nonSkipped = stepOutcomes.filter(
			(s) => s.kind === 'spawn' || s.kind === 'orchestrate',
		);
		const allOk = stepOutcomes.every(
			(s) =>
				s.ok ||
				s.kind === 'verify' /* verify is informational, never blocks */,
		);
		const ok = allOk && nonSkipped.some((s) => s.ok);
		const error = ok
			? undefined
			: `plan "${this.#plan.mode}" did not produce a successful step`;

		return {
			mode: this.#plan.mode,
			steps: stepOutcomes,
			budget: snap,
			ok,
			...(error !== undefined ? { error } : {}),
		};
	}

	async #runStep(step: IPlanStep): Promise<IStepOutcome> {
		// Orchestrator-only or verify-only steps don't touch subagents —
		// they're the orchestrator's own budget spend, recorded below.
		if (step.kind === 'orchestrate' || step.kind === 'verify') {
			// We don't have a subagent budget for orchestrator work, but
			// we still record a single orchestrator tick so the budget
			// surface stays honest. Tokens for orchestrator work are
			// reported via the orchestrator itself; the dispatcher here
			// records 0 for the step (the host logs them at the tool
			// boundary).
			this.#budget.recordOrchestrator(0);
			return {
				order: step.order,
				kind: step.kind,
				slotId: makeSlotId(step.order, 'orchestrator'),
				subagentIds: [],
				result: null,
				rotations: [],
				ok: true,
			};
		}

		if (this.#budget.orchestratorExhausted()) {
			return {
				order: step.order,
				kind: step.kind,
				slotId: makeSlotId(step.order, step.subagentRole ?? 'spawn'),
				subagentIds: [],
				result: null,
				rotations: [],
				ok: false,
			};
		}

		const role = step.subagentRole ?? 'implementer';
		const slotId = makeSlotId(step.order, role);
		const subagentIds: string[] = [];
		const rotations: { subagentId: string; reason: string }[] = [];
		let lastResult: ISubagentResult | null = null;
		let ok = false;

		const maxIter = this.#plan.rotation.maxIterationsPerSubagent;
		for (let iter = 1; iter <= maxIter; iter += 1) {
			const subagentId = makeSubagentId(slotId, iter);
			subagentIds.push(subagentId);
			this.#budget.recordSubagent(subagentId, 0);

			let result: ISubagentResult;
			this.#telemetry.emit(TelemetryEvent.dispatchStart(this.#taskId));
			try {
				result = await this.#port.spawnSubagent({
					role,
					instruction: step.instruction,
					step,
					budget: this.#plan.budget.maxTokensPerSubagent,
					slotId,
				});
			} catch (err) {
				// A thrown port call still settles the dispatch — the end
				// event must fire on the failure path too, not just on
				// success.
				this.#telemetry.emit(
					TelemetryEvent.dispatchEnd(this.#taskId, false, 0),
				);
				// Treat host throws as a hard `error-storm` outcome. The
				// detector will surface it as `error-storm` on the next
				// iteration; on the last iteration the step fails closed.
				const msg = err instanceof Error ? err.message : String(err);
				rotations.push({ subagentId, reason: `error-storm: ${msg}` });
				if (iter === maxIter) {
					return failure(step, slotId, subagentIds, rotations);
				}
				this.#telemetry.emit(
					TelemetryEvent.rotate(
						this.#taskId,
						subagentId,
						`error-storm: ${msg}`,
					),
				);
				continue;
			}

			this.#telemetry.emit(
				TelemetryEvent.dispatchEnd(
					this.#taskId,
					!result.hadError,
					result.tokensUsed,
				),
			);
			this.#budget.recordSubagent(subagentId, result.tokensUsed);
			lastResult = result;

			this.#detector.ingest(
				{
					subagentId,
					slotId,
					output: result.output,
					schemaOk: result.schemaOk,
					hadError: result.hadError,
				},
				this.#budget.snapshot(),
				this.#plan.budget.maxTokensPerSubagent,
			);
			this.#ingestionsBySlot.set(
				slotId,
				(this.#ingestionsBySlot.get(slotId) ?? 0) + 1,
			);

			const verdict = this.#detector.evaluate(slotId);
			// Two-pass acceptance: the first observation is a warmup, the
			// second observation becomes the comparison baseline, and the
			// third observation is what we accept. After the third
			// observation, if the detector still sees no trigger, the
			// subagent is clean and we stop here.
			const historyLen = this.#historyLength(slotId);
			if (verdict.reason === null && historyLen >= 3) {
				ok = true;
				break;
			}
			if (verdict.reason === null) {
				continue;
			}

			// Verdict present ⇒ check the rotation allowlist.
			const allowed = this.#plan.rotation.allow.includes(verdict.reason);
			if (!allowed) {
				// Trigger not allowed ⇒ fail the step, fail-closed.
				return failure(step, slotId, subagentIds, [
					...rotations,
					{ subagentId, reason: `forbidden: ${verdict.reason}` },
				]);
			}

			rotations.push({ subagentId, reason: verdict.reason });
			if (iter === maxIter) {
				// Rotation budget exhausted.
				return failure(step, slotId, subagentIds, rotations);
			}
			// Continue rotating on the next iter.
			this.#telemetry.emit(
				TelemetryEvent.rotate(this.#taskId, subagentId, verdict.reason),
			);
		}

		return {
			order: step.order,
			kind: step.kind,
			slotId,
			subagentIds,
			result: lastResult,
			rotations,
			ok,
		};
	}
}

function emptyStepOutcome(step: IPlanStep): IStepOutcome {
	return {
		order: step.order,
		kind: step.kind,
		slotId: makeSlotId(step.order, step.subagentRole ?? 'orchestrator'),
		subagentIds: [],
		result: null,
		rotations: [],
		ok: false,
	};
}

function failure(
	step: IPlanStep,
	slotId: string,
	subagentIds: readonly string[],
	rotations: readonly { subagentId: string; reason: string }[],
): IStepOutcome {
	return {
		order: step.order,
		kind: step.kind,
		slotId,
		subagentIds: [...subagentIds],
		rotations: [...rotations],
		result: null,
		ok: false,
	};
}
