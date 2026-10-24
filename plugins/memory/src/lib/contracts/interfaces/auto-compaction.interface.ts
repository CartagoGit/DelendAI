/**
 * Contracts for automatic compaction (q00014 S6).
 *
 * `compaction-trigger.interface.ts` describes the recommendation an
 * agent asks for. These shapes describe the decision the POLICY makes
 * on its own — which is a different thing in one respect that matters:
 * nobody asked for it, so nobody is watching what it drops.
 */

import type { IPreserveVerdict } from './preserve-rules.interface';

/** Everything the policy reasons over. Only the first two are required. */
export interface IAutoCompactionSignal {
	/** Distillable tail the agent carries, in tokens. */
	readonly carriedTailTokens: number;
	/** Turns since the last compaction, or since the session began. */
	readonly turnsSinceLastCompaction: number;
	/**
	 * The context window the host gives this session, and how much of it
	 * is already spent. Supplied together or not at all: a ratio needs
	 * both, and guessing either produces a decision nobody can audit.
	 */
	readonly contextBudgetTokens?: number;
	readonly contextUsedTokens?: number;
	/**
	 * How many carried items belong to the single largest topic, and how
	 * many there are in total. One topic that has eaten the context is a
	 * reason to compact even when the totals look healthy — it is the
	 * shape a long debugging session takes.
	 */
	readonly largestTopicItems?: number;
	readonly totalItems?: number;
}

/** Tunable thresholds; omitted fields fall back to the documented defaults. */
export interface IAutoCompactionOptions {
	readonly tokenThreshold?: number;
	readonly turnThreshold?: number;
	/** Fraction of the context budget that counts as pressure. Default 0.7. */
	readonly budgetPressureRatio?: number;
	/** Fraction of carried items one topic may hold. Default 0.6. */
	readonly topicSaturationRatio?: number;
	/** Minimum items before saturation means anything. Default 8. */
	readonly minimumItemsForSaturation?: number;
}

export type IAutoCompactionTrigger =
	| 'token-threshold'
	| 'turn-threshold'
	| 'budget-pressure'
	| 'topic-saturation'
	| 'below-threshold';

/** What the policy decided, and how strictly the result will be judged. */
export interface IAutoCompactionDecision {
	readonly shouldCompact: boolean;
	readonly trigger: IAutoCompactionTrigger;
	/**
	 * Whether a summary produced for this compaction has to pass the
	 * preservation check before it may replace the tail.
	 *
	 * True exactly when the policy fired on its own. A compaction the
	 * agent asked for stays advisory — it can see what it is dropping
	 * and may have a reason — but one nobody asked for gets no such
	 * benefit of the doubt.
	 */
	readonly binding: boolean;
	/** One-line, agent-readable rationale (safe to show verbatim). */
	readonly hint: string;
}

/** Whether a compacted summary may replace the tail it summarises. */
export interface ICompactionAcceptance {
	readonly accept: boolean;
	/** Load-bearing fragments that would be lost by accepting. */
	readonly wouldLose: number;
	readonly reason: string;
	readonly nextAction: string;
}

/** What `judgeCompactedSummary` needs to answer. */
export interface IJudgeCompactedSummaryInput {
	readonly binding: boolean;
	readonly verdict: IPreserveVerdict;
}
