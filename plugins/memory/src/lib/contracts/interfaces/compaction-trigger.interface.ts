/**
 * Contracts for the in-session compaction *trigger* (f00090 S2).
 *
 * S1 ships the distiller (the mechanism); S2 ships the deterministic
 * *signal* that tells the agent WHEN it is worth compacting. The trigger is
 * a pure function over these shapes — no clock, no I/O — so orientation
 * (`overview` / `auto_work`) can surface the recommendation cheaply.
 */

/** The observable state the trigger reasons over. */
export interface ICompactionTriggerSignal {
	/**
	 * Estimated tokens of *distillable* conversation tail the agent is
	 * currently carrying (raw output, dead-end exploration, superseded
	 * plans). This is the cost `memory_compact` would reclaim.
	 */
	readonly carriedTailTokens: number;
	/**
	 * Turns elapsed since the last `memory_compact` (or since the session
	 * start when none has run yet).
	 */
	readonly turnsSinceLastCompaction: number;
}

/** Tunable thresholds; omitted fields fall back to the documented defaults. */
export interface ICompactionTriggerOptions {
	/** Compact once the carried tail crosses this many tokens. */
	readonly tokenThreshold?: number;
	/** Compact once this many turns have elapsed since the last compaction. */
	readonly turnThreshold?: number;
}

/** Why the trigger fired (or did not). */
export type TCompactionTriggerReason =
	| 'token-threshold'
	| 'turn-threshold'
	| 'below-threshold';

/** The deterministic recommendation orientation surfaces to the agent. */
export interface ICompactionTriggerDecision {
	readonly shouldCompact: boolean;
	readonly reason: TCompactionTriggerReason;
	readonly carriedTailTokens: number;
	readonly tokenThreshold: number;
	readonly turnsSinceLastCompaction: number;
	readonly turnThreshold: number;
	/** One-line, agent-readable rationale (safe to show verbatim). */
	readonly hint: string;
}
