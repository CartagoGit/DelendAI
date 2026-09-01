/**
 * Dispatch contracts — the boundary between the policy engine and
 * the host's subagent runtime.
 *
 * The plugin does NOT spawn subagents itself; the host injects an
 * `IDispatchPort` at register time. This keeps the plugin process-
 * portable (every MCP host that wants to use this plugin wires its
 * own port) and trivially testable (tests inject a deterministic
 * fake). New runtime integrations land in S3 (parallel) without
 * changing this contract.
 */
import type { IPlanStep, IModePlan, SubagentRole } from '../policy/types.js';

/** What a single subagent run produced. */
export interface ISubagentResult {
	/** The subagent id the host assigned. */
	readonly subagentId: string;
	/** Tokens the subagent consumed (host-reported; the plugin trusts it). */
	readonly tokensUsed: number;
	/** Final textual output. */
	readonly output: string;
	/** True when the output parsed cleanly against the expected outputSchema. */
	readonly schemaOk: boolean;
	/** True when the host step errored (tool call failed, RPC failed). */
	readonly hadError: boolean;
}

/**
 * Boundary the host implements. Production wires this to whatever
 * subagent invocation the host already has (`task` tool, custom
 * RPC, message bus…). Tests wire a `FakeDispatchPort` that drives
 * scripted scenarios (force `repeated-output`, `error-storm`, etc.).
 */
export interface IDispatchPort {
	/**
	 * Run a single subagent step. The port is responsible for:
	 *
	 *   - selecting the right provider via `auto-agent-selector`
	 *     (out of scope here — the plugin just calls the port)
	 *   - enforcing the per-step token cap on the host side
	 *     (defensive; `BudgetTracker` is the source of truth)
	 *   - returning a structured `ISubagentResult`
	 */
	spawnSubagent(input: {
		readonly role: SubagentRole;
		readonly instruction: string;
		readonly step: IPlanStep;
		/** Capped by the policy at `maxTokensPerSubagent`. */
		readonly budget: number;
		/** Stable id for this rotation slot (the executor generates). */
		readonly slotId: string;
	}): Promise<ISubagentResult>;
}

/**
 * Outcome of executing an `IModePlan` end-to-end. Captures per-step
 * results, the rotation log (which steps were rotated and why), and
 * the final budget snapshot.
 */
export interface IPlanOutcome {
	/** Mode that was dispatched. */
	readonly mode: IModePlan['mode'];
	/** Per-step result, in execution order. */
	readonly steps: readonly IStepOutcome[];
	/** Final budget snapshot. */
	readonly budget: IPlanOutcomeBudget;
	/** True when at least one step succeeded. */
	readonly ok: boolean;
	/** Diagnostic message when `ok === false`. */
	readonly error?: string;
}

export interface IStepOutcome {
	/** Order from the original plan. */
	readonly order: number;
	readonly kind: IPlanStep['kind'];
	readonly slotId: string;
	/** Every subagent id that ran this step, including rotated ones. */
	readonly subagentIds: readonly string[];
	/** Result of the final (non-rotated) subagent run. */
	readonly result: ISubagentResult | null;
	/** Rotation reasons emitted during this step. */
	readonly rotations: readonly {
		readonly subagentId: string;
		readonly reason: string;
	}[];
	/** True when the step reached a terminal success. */
	readonly ok: boolean;
}

export interface IPlanOutcomeBudget {
	readonly consumedOrchestrator: number;
	readonly consumedSubagents: ReadonlyMap<string, number>;
	readonly steps: number;
}
