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
import {
	barrenStreak,
	type IProgressEvidence,
	NO_EVIDENCE,
} from '../rotation/progress-evidence.js';
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
	#calls = 0;
	#turns = 0;
	#retries = 0;
	#running = 0;
	#turnEvidence: IProgressEvidence[] = [];

	constructor(policy: IBudgetPolicy) {
		this.#policy = policy;
	}

	/**
	 * Count one executed step, whoever spent the tokens for it.
	 *
	 * `steps` used to be incremented only inside `recordOrchestrator`,
	 * which meant a plan made entirely of `spawn` steps — the common
	 * case — reported `steps: 0` while its subagents were charged for
	 * real work. The step count is a property of the PLAN executing, not
	 * of who paid, so the executor increments it per step and the token
	 * recorders only account for tokens.
	 */
	recordStep(): void {
		this.#steps += 1;
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

	/** Count one call to a provider. Returns a blocker when it breaches the limit. */
	recordCall(): string | null {
		this.#calls += 1;
		return this.#over('maxCalls', this.#calls);
	}

	/** Count one retry. Returns a blocker when it breaches the limit. */
	recordRetry(): string | null {
		this.#retries += 1;
		return this.#over('maxRetries', this.#retries);
	}

	/**
	 * Count one turn with what it produced. Returns a blocker when the turn
	 * limit is breached or the last N turns produced no progress.
	 */
	recordTurn(evidence: IProgressEvidence = NO_EVIDENCE): string | null {
		this.#turns += 1;
		const limit = this.#policy.maxBarrenTurns ?? 0;
		this.#turnEvidence.push(evidence);
		if (limit > 0) this.#turnEvidence = this.#turnEvidence.slice(-limit);
		const turnBlocker = this.#over('maxTurns', this.#turns);
		if (turnBlocker !== null) return turnBlocker;
		if (limit > 0 && barrenStreak(this.#turnEvidence) >= limit) {
			return `no progress: ${limit} consecutive turns produced nothing (maxBarrenTurns ${limit})`;
		}
		return null;
	}

	/** Take a running slot. Returns a blocker when none is free (the slot is not taken). */
	acquireSlot(): string | null {
		const blocker = this.#over('maxConcurrency', this.#running + 1);
		if (blocker === null) this.#running += 1;
		return blocker;
	}

	/** Give a running slot back. */
	releaseSlot(): void {
		this.#running = Math.max(0, this.#running - 1);
	}

	/** A blocker naming the limit when `used` goes past it; null otherwise. */
	#over(
		limit: 'maxCalls' | 'maxTurns' | 'maxRetries' | 'maxConcurrency',
		used: number,
	): string | null {
		const cap = this.#policy[limit] ?? 0;
		if (cap === 0 || used <= cap) return null;
		return `${limit} ${cap} exceeded (${used})`;
	}

	reset(): void {
		this.#calls = 0;
		this.#turns = 0;
		this.#retries = 0;
		this.#running = 0;
		this.#turnEvidence = [];
		this.#consumedOrchestrator = 0;
		this.#consumedSubagents.clear();
		this.#steps = 0;
	}
}
