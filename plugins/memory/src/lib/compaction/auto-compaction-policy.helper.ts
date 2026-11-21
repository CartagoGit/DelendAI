/**
 * auto-compaction-policy.ts — WHEN compaction happens without being
 * asked, and what that costs it (q00014 S6).
 *
 * `compaction-trigger.ts` already answers "is compacting worth it?" for
 * an agent that asked. This module answers the harder version: should
 * the system compact on its own, and — because nobody is watching an
 * automatic compaction — what is it not allowed to lose while doing it.
 *
 * Two triggers are added to the two that already existed, and both come
 * from how long sessions actually fail:
 *
 *   - **budget pressure.** The token thresholds are absolute; a host
 *     with a small window is already in trouble at a tail the default
 *     threshold calls healthy. When the caller can say how much of the
 *     window is gone, the ratio decides.
 *   - **topic saturation.** A single topic that has eaten most of the
 *     carried items is the shape a long debugging session takes: the
 *     totals look fine and the context is nonetheless useless for
 *     anything else.
 *
 * The part that matters more than the thresholds is `binding`. A
 * compaction the agent requested stays advisory — it can see what it is
 * dropping and may have a good reason. A compaction the policy fires on
 * its own gets no such benefit of the doubt: the summary has to carry
 * every load-bearing fragment (`preserve-rules.ts`) or the tail stays
 * where it is. Silently losing a constraint the user set does not look
 * like a failure; it looks like a shorter context, and that is exactly
 * why it needs a gate that cannot be talked out of.
 */

import type {
	IAutoCompactionDecision,
	IAutoCompactionOptions,
	IAutoCompactionSignal,
	ICompactionAcceptance,
	IJudgeCompactedSummaryInput,
	IAutoCompactionTrigger,
} from '../contracts/interfaces/auto-compaction.interface';

/** Same defaults as the agent-facing trigger, so the two agree. */
const DEFAULT_TOKEN_THRESHOLD = 8_000;
const DEFAULT_TURN_THRESHOLD = 25;

/**
 * Seven tenths of the window. Past this the next few turns are what
 * fail, so there is no value in waiting for an absolute token count
 * that a small window may never reach.
 */
const DEFAULT_BUDGET_PRESSURE_RATIO = 0.7;

/** One topic holding three fifths of the carried items has taken over. */
const DEFAULT_TOPIC_SATURATION_RATIO = 0.6;

/**
 * Below this, a dominant topic means nothing: two items out of three is
 * a ratio of 0.67 and a conversation that has barely started.
 */
const DEFAULT_MINIMUM_ITEMS = 8;

const ratioOf = (part: number, whole: number): number =>
	whole <= 0 ? 0 : part / whole;

/**
 * Decide whether to compact now, and how strictly the result is judged.
 *
 * Pure and deterministic: no clock, no I/O, no randomness. The order of
 * the checks is the order of the evidence's directness — a tail that is
 * already too big is a fact, a budget ratio is a measurement, turns are
 * a proxy, and saturation is a shape.
 */
export const decideAutoCompaction = (
	signal: IAutoCompactionSignal,
	options: IAutoCompactionOptions = {},
): IAutoCompactionDecision => {
	const tokenThreshold = options.tokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;
	const turnThreshold = options.turnThreshold ?? DEFAULT_TURN_THRESHOLD;
	const pressureRatio =
		options.budgetPressureRatio ?? DEFAULT_BUDGET_PRESSURE_RATIO;
	const saturationRatio =
		options.topicSaturationRatio ?? DEFAULT_TOPIC_SATURATION_RATIO;
	const minimumItems =
		options.minimumItemsForSaturation ?? DEFAULT_MINIMUM_ITEMS;

	const carriedTailTokens = Math.max(0, signal.carriedTailTokens);
	const turnsSinceLastCompaction = Math.max(
		0,
		signal.turnsSinceLastCompaction,
	);

	// Both halves or neither: a ratio built from one of them is a number
	// nobody can audit.
	const budgetKnown =
		signal.contextBudgetTokens !== undefined &&
		signal.contextUsedTokens !== undefined &&
		signal.contextBudgetTokens > 0;
	const usedRatio = budgetKnown
		? ratioOf(
				Math.max(0, signal.contextUsedTokens ?? 0),
				signal.contextBudgetTokens ?? 0,
			)
		: 0;

	const itemsKnown =
		signal.largestTopicItems !== undefined &&
		signal.totalItems !== undefined &&
		signal.totalItems >= minimumItems;
	const topicRatio = itemsKnown
		? ratioOf(
				Math.max(0, signal.largestTopicItems ?? 0),
				signal.totalItems ?? 0,
			)
		: 0;

	const trigger: IAutoCompactionTrigger =
		carriedTailTokens >= tokenThreshold
			? 'token-threshold'
			: budgetKnown && usedRatio >= pressureRatio
				? 'budget-pressure'
				: turnsSinceLastCompaction >= turnThreshold
					? 'turn-threshold'
					: itemsKnown && topicRatio >= saturationRatio
						? 'topic-saturation'
						: 'below-threshold';

	const shouldCompact = trigger !== 'below-threshold';

	const hint = ((): string => {
		switch (trigger) {
			case 'token-threshold':
				return `Carried tail is ~${carriedTailTokens} tokens (≥ ${tokenThreshold}). Compacting now; the summary must keep every constraint, decision, cause and identifier.`;
			case 'budget-pressure':
				return `${Math.round(usedRatio * 100)}% of the context window is spent (≥ ${Math.round(pressureRatio * 100)}%). Compacting now; the summary must keep every constraint, decision, cause and identifier.`;
			case 'turn-threshold':
				return `${turnsSinceLastCompaction} turns since the last compaction (≥ ${turnThreshold}). Compacting now; the summary must keep every constraint, decision, cause and identifier.`;
			case 'topic-saturation':
				return `One topic holds ${Math.round(topicRatio * 100)}% of the carried items (≥ ${Math.round(saturationRatio * 100)}%). Compacting now; the summary must keep every constraint, decision, cause and identifier.`;
			default:
				return `No automatic compaction (tail ~${carriedTailTokens}/${tokenThreshold} tokens, ${turnsSinceLastCompaction}/${turnThreshold} turns).`;
		}
	})();

	return {
		shouldCompact,
		trigger,
		// The policy fired, so the policy is bound by its own result.
		binding: shouldCompact,
		hint,
	};
};

/**
 * Whether a compacted summary may replace the tail it summarises.
 *
 * The asymmetry is the point. An advisory compaction always proceeds and
 * reports what it dropped — the caller asked, and can see the answer. A
 * binding one that drops load-bearing material does NOT proceed: the
 * tail is larger than the summary and costs tokens, but a conversation
 * that has quietly lost a user's constraint costs the user's decision,
 * and the second is not recoverable by spending more tokens.
 */
export const judgeCompactedSummary = (
	input: IJudgeCompactedSummaryInput,
): ICompactionAcceptance => {
	const wouldLose = input.verdict.dropped.length;
	if (input.verdict.ok) {
		return {
			accept: true,
			wouldLose: 0,
			reason: 'the summary carries every load-bearing fragment.',
			nextAction: 'Replace the carried tail with the digest.',
		};
	}
	if (!input.binding) {
		return {
			accept: true,
			wouldLose,
			reason: `advisory compaction: ${wouldLose} load-bearing fragment(s) are not in the summary, and the caller asked for this compaction anyway.`,
			nextAction: input.verdict.nextAction,
		};
	}
	return {
		accept: false,
		wouldLose,
		reason: `automatic compaction refused: ${wouldLose} load-bearing fragment(s) would be lost, and nobody asked for this compaction.`,
		nextAction:
			'Keep the tail. Re-summarise carrying the listed fragments verbatim, or compact explicitly if the loss is intended.',
	};
};
