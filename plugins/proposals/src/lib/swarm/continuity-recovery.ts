/**
 * continuity-recovery.ts
 *
 * Reusable health heuristics for proposal continuity: stale-lock detection,
 * stale-checkpoint detection, and task-hint extraction for the cascade.
 *
 * Thin wrapper over `runtime-recovery.ts` (which owns the primitives
 * `isStaleTimestamp`, `isStaleLock`, `shouldResetFromCheckpoint` and the
 * `CONTINUITY_STALE_WINDOW_MS` / `CONTINUITY_REPEAT_RESET_THRESHOLD`
 * constants). This module re-exports those primitives so callers that need
 * continuity-aware decisions (e.g. the `the continue-proposal flow` prompt)
 * can import from a single place, and adds the prompt-only helpers
 * `extractTaskHint` / `extractCheckpointNextTaskHint` plus a structured
 * `evaluateContinuityRecovery` decision API.
 */

import {
	isStaleLock as isStaleLockPrimitive,
	isStaleTimestamp as isStaleTimestampPrimitive,
	shouldResetFromCheckpoint as shouldResetFromCheckpointPrimitive,
} from './runtime-recovery';
import type {
	IRuntimeRecoveryCheckpoint,
	IRuntimeRecoveryLock,
} from './runtime-recovery';

// ---------------------------------------------------------------------------
// Re-exports — keep callers depending on a single module
// ---------------------------------------------------------------------------

export {
	CONTINUITY_REPEAT_RESET_THRESHOLD,
	CONTINUITY_STALE_WINDOW_MS,
	CLOSED_CHECKPOINT_STATUSES,
} from './runtime-recovery';

export const isStaleTimestamp = isStaleTimestampPrimitive;
export const isStaleLock = isStaleLockPrimitive;
export const shouldResetFromCheckpoint = shouldResetFromCheckpointPrimitive;

// ---------------------------------------------------------------------------
// Local types — narrow structural shapes consumed by the cascade prompt
// ---------------------------------------------------------------------------

/**
 * Structural shape of a single lock entry, decoupled from the lock-file
 * type. Mirrors `IRuntimeRecoveryLock` so the prompt can pass values from
 * the lock file directly.
 */
export interface IContinuityLockLike {
	readonly task_id?: string;
	// The prompt still surfaces the live lock holder in the returned
	// cascade decision (`lockHolder`), so the reusable continuity shape
	// must preserve `agent` even though the stale-lock heuristic itself
	// only needs `last_seen` + `task_id`.
	readonly agent?: string;
	readonly last_seen?: string;
}

/**
 * Structural shape of an orchestrator checkpoint, decoupled from the
 * orchestrator file type. Mirrors `IRuntimeRecoveryCheckpoint` (including
 * the `proposalId` field the cascade uses to filter) plus the prompt-only
 * fields the cascade inspects (selected task, handoffs, nextAction). The
 * handoffs array is intentionally permissive: only the `message` field is
 * read.
 */
export interface IContinuityCheckpointLike {
	// The cascade compares the checkpoint owner against the current
	// proposal before deciding `resume` vs `next`, so `proposalId`
	// remains part of the structural contract
	// extraction to `continuity-recovery.ts`.
	readonly proposalId?: string;
	readonly status?: string;
	readonly updatedAt?: string;
	readonly lastUpdated?: string;
	readonly nextAction?: string;
	readonly observations?: { readonly selectedTask?: string };
	readonly recovery?: { readonly repeatedCount?: number };
	readonly handoffs?: ReadonlyArray<{ readonly message?: string }>;
}

/**
 * The decision returned by `evaluateContinuityRecovery`. `taskHint` and
 * `reason` are only populated when `shouldReset` is `true`; the structured
 * `IRequestedCascadeMode` is the caller's input (it owns the requested
 * resume/next/auto/reset decision; this module only signals whether a
 * forced reset is justified).
 */
export interface IContinuityRecoveryDecision {
	readonly shouldReset: boolean;
	readonly taskHint?: string | undefined;
	readonly reason?: string | undefined;
}

// ---------------------------------------------------------------------------
// Task-hint extraction — prompts-only helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a `T<digits>` task id from an arbitrary string. Returns the id
 * uppercased so the cascade can compare against canonical task hints
 * (`T1`, `T2B`, …) without case-folding at the call site.
 */
export function extractTaskHint(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	const match = value.match(/(?:[A-Za-z0-9]+-)?(T\d+(?:\.\d+)?)/i);
	return match?.[1]?.toUpperCase();
}

/**
 * Picks the next task hint to suggest after a closed checkpoint. Prefers
 * `checkpoint.nextAction`; falls back to the first handoff message that
 * carries a recognisable task id. Returns `undefined` if neither yields a
 * hint, which the caller treats as "no hint, the agent picks the first
 * compatible task".
 */
export function extractCheckpointNextTaskHint(
	checkpoint: IContinuityCheckpointLike,
): string | undefined {
	return (
		extractTaskHint(checkpoint.nextAction) ??
		checkpoint.handoffs
			?.map((handoff) => extractTaskHint(handoff.message))
			.find((taskHint) => taskHint !== undefined)
	);
}

// ---------------------------------------------------------------------------
// evaluateContinuityRecovery — structured decision for the cascade prompt
// ---------------------------------------------------------------------------

/**
 * Decides whether the cascade should force a `mode: 'reset'` for the given
 * proposal based on the observed lock and checkpoint. The decision is
 * intentionally narrow: this function does NOT inspect chat context, the
 * proposal index, or the `requestedMode` for resume/next semantics — those
 * remain the responsibility of the cascade in
 * `the continue-proposal logic`.
 */
export function evaluateContinuityRecovery(input: {
	readonly lock?: IContinuityLockLike | undefined;
	readonly checkpoint?: IContinuityCheckpointLike | null | undefined;
	readonly requestedMode: 'resume' | 'next' | 'auto';
	readonly proposalId: string;
}): IContinuityRecoveryDecision {
	if (input.requestedMode !== 'auto') {
		// Explicit resume/next/reset: the caller has already decided; this
		// module only auto-detects stale state in `auto` mode.
		return { shouldReset: false };
	}

	if (isStaleLock(input.lock)) {
		return {
			shouldReset: true,
			taskHint: extractTaskHint(input.lock?.task_id),
			reason: `Detected stale lock on ${input.lock?.task_id ?? 'unknown task'} for ${input.proposalId}; reset the execution state, preserve proposal/task context, and resume from the last trustworthy checkpoint instead of repeating the same stuck step.`,
		};
	}

	if (input.checkpoint !== undefined && input.checkpoint !== null) {
		// The `IContinuityCheckpointLike` shape is a structural superset of
		// `IRuntimeRecoveryCheckpoint`. Under `exactOptionalPropertyTypes`
		// we project only the defined optional fields so the assignment
		// does not violate the strict-optional contract.
		const asRecoveryCheckpoint: IRuntimeRecoveryCheckpoint = {
			...(input.checkpoint.status !== undefined
				? { status: input.checkpoint.status }
				: {}),
			...(input.checkpoint.updatedAt !== undefined
				? { updatedAt: input.checkpoint.updatedAt }
				: {}),
			...(input.checkpoint.lastUpdated !== undefined
				? { lastUpdated: input.checkpoint.lastUpdated }
				: {}),
			...(input.checkpoint.recovery !== undefined
				? { recovery: input.checkpoint.recovery }
				: {}),
		};
		if (shouldResetFromCheckpoint(asRecoveryCheckpoint)) {
			return {
				shouldReset: true,
				taskHint:
					input.checkpoint.observations?.selectedTask ??
					extractTaskHint(input.checkpoint.nextAction),
				reason: `Detected stale checkpoint for ${input.proposalId}; reset the execution state, keep the same proposal/task context, and continue from the last trustworthy handoff instead of looping on the stale step.`,
			};
		}
	}

	return { shouldReset: false };
}

// Re-export the structural alias types so consumers can keep depending on
// the prompt-coupling shape (`IContinuityLockLike`/`IContinuityCheckpointLike`)
// without reaching into `runtime-recovery.ts`.
export type { IRuntimeRecoveryCheckpoint, IRuntimeRecoveryLock };
