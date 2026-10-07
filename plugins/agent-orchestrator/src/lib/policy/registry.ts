/**
 * Registry for mode adapters — the OCP seam of the policy engine.
 *
 * New modes (e.g. `pipeline`, `tree-of-thought`) plug in via:
 *
 *   registry.register({ id: "pipeline", plan, validate, accepts })
 *
 * without editing `plan()`. This keeps the policy engine SOLID: open
 * for extension, closed for modification. The orchestrator selects an
 * adapter by its `id`; an unknown id raises so the caller fails
 * fast (no silent fallback).
 *
 * The registry is process-local; the orchestrator creates one
 * instance per plugin register() and hands it to its tools. Tests
 * use a fresh registry per spec.
 */
import type {
	IModePlan,
	IOrchestratorPolicy,
	ITask,
	OrchestrationMode,
} from './types.js';

/**
 * Minimal structural shape a registered adapter must satisfy.
 * Kept narrow so SOLID's ISP holds: only what the planner needs.
 */
export interface IModeAdapter {
	readonly id: OrchestrationMode;
	/** Can this adapter plan this task at all? Cheap, fast, no I/O. */
	accepts(task: ITask, policy: IOrchestratorPolicy): boolean;
	/** Produce a plan. Pure: identical inputs ⇒ identical output. */
	plan(task: ITask, policy: IOrchestratorPolicy): IModePlan;
}

export class UnknownModeError extends Error {
	readonly mode: string;
	constructor(mode: string) {
		super(`Unknown orchestration mode: ${mode}`);
		this.name = 'UnknownModeError';
		this.mode = mode;
	}
}

export class DuplicateModeError extends Error {
	readonly mode: string;
	constructor(mode: string) {
		super(`Mode adapter already registered: ${mode}`);
		this.name = 'DuplicateModeError';
		this.mode = mode;
	}
}

export class ModeRegistry {
	readonly #adapters = new Map<OrchestrationMode, IModeAdapter>();

	/** Register an adapter. Throws on duplicate or invalid id. */
	register(adapter: IModeAdapter): this {
		if (
			!adapter ||
			typeof adapter.id !== 'string' ||
			adapter.id.length === 0
		) {
			throw new TypeError(
				'register() requires an adapter with a non-empty string id',
			);
		}
		if (this.#adapters.has(adapter.id)) {
			throw new DuplicateModeError(adapter.id);
		}
		this.#adapters.set(adapter.id, adapter);
		return this;
	}

	/** Look up an adapter by id; throws when missing. */
	get(mode: OrchestrationMode): IModeAdapter {
		const found = this.#adapters.get(mode);
		if (!found) throw new UnknownModeError(mode);
		return found;
	}

	/** Iterate every registered adapter (debug + auto-mode scanning). */
	list(): readonly IModeAdapter[] {
		return Array.from(this.#adapters.values());
	}

	has(mode: OrchestrationMode): boolean {
		return this.#adapters.has(mode);
	}
}
