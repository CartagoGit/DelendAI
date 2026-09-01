/**
 * Budget tracker — pure accounting for tokens per agent + per subagent.
 *
 * The executor calls `record()` after each step; `shouldRotate()` and
 * `exhausted()` answer policy questions without coupling to the
 * executor. Tracks live until `reset()`.
 *
 * Pure: no I/O, no clock; the executor injects ticks. Tests use a
 * fake `Now` to advance it deterministically.
 */
import type { IBudgetPolicy } from '../policy/types.js';

export interface IBudgetUsage {
	readonly consumedOrchestrator: number;
	readonly consumedSubagents: ReadonlyMap<string, number>;
	readonly steps: number;
}

export class BudgetTracker {
	readonly #policy: IBudgetPolicy;
	#consumedOrchestrator = 0;
	#consumedSubagents = new Map<string, number>();
	#steps = 0;

	constructor(policy: IBudgetPolicy) {
		this.#policy = policy;
	}

	/** Record tokens consumed by the *orchestrator itself* this step. */
	recordOrchestrator(tokens: number): void {
		if (!Number.isFinite(tokens) || tokens < 0) {
			throw new RangeError(`tokens must be ≥ 0, got ${tokens}`);
		}
		this.#consumedOrchestrator += tokens;
		this.#steps += 1;
	}

	/** Record tokens consumed by a subagent (keyed by stable subagent id). */
	recordSubagent(subagentId: string, tokens: number): void {
		if (!subagentId) throw new RangeError('subagentId is required');
		if (!Number.isFinite(tokens) || tokens < 0) {
			throw new RangeError(`tokens must be ≥ 0, got ${tokens}`);
		}
		this.#consumedSubagents.set(
			subagentId,
			(this.#consumedSubagents.get(subagentId) ?? 0) + tokens,
		);
	}

	/** Snapshot current usage — for telemetry + audits. */
	snapshot(): IBudgetUsage {
		return {
			consumedOrchestrator: this.#consumedOrchestrator,
			consumedSubagents: new Map(this.#consumedSubagents),
			steps: this.#steps,
		};
	}

	/** Has the orchestrator hit its per-task cap? 0 cap = never exhausted. */
	orchestratorExhausted(): boolean {
		if (this.#policy.maxTokensOrchestrator === 0) return false;
		return this.#consumedOrchestrator >= this.#policy.maxTokensOrchestrator;
	}

	/** Has a specific subagent hit its per-step cap? */
	subagentExhausted(subagentId: string): boolean {
		if (this.#policy.maxTokensPerSubagent === 0) return false;
		const used = this.#consumedSubagents.get(subagentId) ?? 0;
		return used >= this.#policy.maxTokensPerSubagent;
	}

	reset(): void {
		this.#consumedOrchestrator = 0;
		this.#consumedSubagents.clear();
		this.#steps = 0;
	}
}
