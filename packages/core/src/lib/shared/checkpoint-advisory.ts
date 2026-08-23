/**
 * Pure merge / inject helpers for checkpoint advisories (f00156).
 *
 * Highest severity wins (`block` > `strong` > `recommend`). A duplicate
 * `dedupeKey` against the caller-supplied last key is dropped so the
 * same advisory is not re-injected on every subsequent tool call.
 *
 * This module never reads host transcripts, context meters, or quotas.
 */
import type {
	CheckpointAdvisorySeverity,
	ICheckpointAdvisory,
} from '../contracts/interfaces/checkpoint-advisory.interface';

const SEVERITY_RANK: Readonly<Record<CheckpointAdvisorySeverity, number>> = {
	recommend: 1,
	strong: 2,
	block: 3,
};

const isTriggered = (
	advisory: ICheckpointAdvisory | null | undefined,
): advisory is ICheckpointAdvisory =>
	advisory !== null && advisory !== undefined && advisory.triggered === true;

/**
 * Pick the strongest triggered advisory. `block` always outranks
 * `strong`/`recommend`. Equal severity keeps the earlier candidate
 * (plugin registration order).
 */
export const mergeCheckpointAdvisories = (
	candidates: readonly (ICheckpointAdvisory | null | undefined)[],
): ICheckpointAdvisory | null => {
	let winner: ICheckpointAdvisory | null = null;
	let winnerRank = 0;
	for (const candidate of candidates) {
		if (!isTriggered(candidate)) continue;
		const rank = SEVERITY_RANK[candidate.severity] ?? 0;
		if (rank > winnerRank) {
			winner = candidate;
			winnerRank = rank;
		}
	}
	return winner;
};

/**
 * Merge then drop the winner when its `dedupeKey` matches `lastDedupeKey`.
 * Callers persist the returned key themselves; this helper is pure.
 */
export const selectCheckpointAdvisory = (
	candidates: readonly (ICheckpointAdvisory | null | undefined)[],
	lastDedupeKey?: string | null,
): ICheckpointAdvisory | null => {
	const winner = mergeCheckpointAdvisories(candidates);
	if (winner === null) return null;
	if (
		lastDedupeKey !== undefined &&
		lastDedupeKey !== null &&
		lastDedupeKey === winner.dedupeKey
	) {
		return null;
	}
	return winner;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Attach `checkpointAdvisory` to a tool result's `structuredContent`
 * (creating it when absent). Mutates the in-memory result; no I/O.
 * No-op when `advisory` is null or the result is not an object.
 */
export const injectCheckpointAdvisory = (
	result: unknown,
	advisory: ICheckpointAdvisory | null,
): void => {
	if (advisory === null || !isRecord(result)) return;
	const existing = result.structuredContent;
	const structured: Record<string, unknown> = isRecord(existing)
		? existing
		: {};
	structured.checkpointAdvisory = advisory;
	result.structuredContent = structured;
};
