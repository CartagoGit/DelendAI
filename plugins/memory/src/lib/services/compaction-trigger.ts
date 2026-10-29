/**
 * compaction-trigger.ts — the in-session compaction *signal* (f00090 S2).
 *
 * S1 gave the agent a pure distiller (`distillContextDigest`) and the
 * `memory_compact` tool. This module answers the complementary question the
 * agent needs from orientation: *when* is compacting worth it? It is a pure,
 * deterministic function over `ICompactionTriggerSignal` — no clock, no I/O,
 * no randomness — so `overview`/`auto_work` can embed the recommendation
 * without cost or side effects.
 *
 * Heuristic (either condition fires): the carried, distillable tail has grown
 * past `tokenThreshold`, OR `turnThreshold` turns have elapsed since the last
 * compaction. Token pressure wins the reason tie-break because it is the
 * direct cost signal (the f00086 philosophy: act on the visible token cost).
 */
import type {
	ICompactionTriggerDecision,
	ICompactionTriggerOptions,
	ICompactionTriggerSignal,
} from '../contracts/interfaces/compaction-trigger.interface';

/**
 * Default carried-tail budget before compaction pays off. ~8k tokens of raw
 * output/exploration/superseded noise is a meaningful, recurring per-turn
 * cost that the distiller reliably shrinks to a few hundred tokens.
 */
const DEFAULT_TOKEN_THRESHOLD = 8_000;

/**
 * Default turn budget: even under the token threshold, a long chat accretes
 * enough stale tail every ~25 turns that a periodic compaction keeps the
 * carried context lean.
 */
const DEFAULT_TURN_THRESHOLD = 25;

/**
 * Decide whether the agent should compact now. Pure and deterministic:
 * identical `(signal, options)` always yields an identical decision.
 */
export const evaluateCompactionTrigger = (
	signal: ICompactionTriggerSignal,
	options: ICompactionTriggerOptions = {},
): ICompactionTriggerDecision => {
	const tokenThreshold = options.tokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;
	const turnThreshold = options.turnThreshold ?? DEFAULT_TURN_THRESHOLD;

	const carriedTailTokens = Math.max(0, signal.carriedTailTokens);
	const turnsSinceLastCompaction = Math.max(
		0,
		signal.turnsSinceLastCompaction,
	);

	const tokenTripped = carriedTailTokens >= tokenThreshold;
	const turnTripped = turnsSinceLastCompaction >= turnThreshold;
	const shouldCompact = tokenTripped || turnTripped;

	// Token pressure is the stronger signal, so it wins the tie-break.
	const reason = tokenTripped
		? 'token-threshold'
		: turnTripped
			? 'turn-threshold'
			: 'below-threshold';

	const hint = shouldCompact
		? reason === 'token-threshold'
			? `Carried tail is ~${carriedTailTokens} tokens (≥ ${tokenThreshold}); run memory_compact to drop the raw tail.`
			: `${turnsSinceLastCompaction} turns since the last compaction (≥ ${turnThreshold}); run memory_compact to stay lean.`
		: `No compaction needed (tail ~${carriedTailTokens}/${tokenThreshold} tokens, ${turnsSinceLastCompaction}/${turnThreshold} turns).`;

	return {
		shouldCompact,
		reason,
		carriedTailTokens,
		tokenThreshold,
		turnsSinceLastCompaction,
		turnThreshold,
		hint,
	};
};
