/**
 * trigger-types.ts — shared types for every trigger in the
 * commit-policy engine. Kept in one file so adding a new trigger
 * kind only touches two files (this + the trigger factory).
 */

import type {
	ICommitPolicyCadence,
	ICommitPolicyTrigger,
} from '../contracts/options';

/** What a trigger fires. `manual` is the only one that ignores `enabled`. */
export type TriggerKind = ICommitPolicyTrigger['kind'];

/** Slice-specific config (subset of the trigger's discriminated union). */
export interface ISliceTriggerConfig {
	readonly kind: 'slice';
	readonly onStatuses: readonly string[];
}

/** Threshold-specific config. */
export interface IThresholdTriggerConfig {
	readonly kind: 'threshold';
	readonly files: number;
}

/** Interval-specific config. */
export interface IIntervalTriggerConfig {
	readonly kind: 'interval';
	readonly minutes: number;
}

/** Manual-specific config. */
export interface IManualTriggerConfig {
	readonly kind: 'manual';
}

/**
 * x00263 (AUD-CP-005): non-empty list of paths a slice owns.
 * Always carries the `paths` array — empty arrays are an
 * upstream refusal, never a default. The driver asserts that
 * staged paths ⊆ `paths` after `git add --` runs.
 */
export interface SliceFiles {
	readonly paths: readonly string[];
}

/**
 * Event emitted by a trigger when it fires.
 *
 * x00263: slice events MUST carry `files` when the slice has
 * any. `SLICE_HAS_NO_FILES` is emitted upstream instead of an
 * empty `files` array, so this field is non-empty whenever it
 * is present.
 */
export interface ITriggerEvent {
	readonly kind: TriggerKind;
	readonly proposalId?: string;
	readonly sliceId?: string;
	readonly status?: string;
	readonly dirtyCount?: number;
	readonly unpushedCount?: number;
	/**
	 * x00263: paths the slice owns. Only set on slice events.
	 * Drivers that receive an event without `files` MUST refuse
	 * with `SLICE_HAS_NO_FILES` (or honour the explicit skip
	 * flag) — never stage a superset.
	 */
	readonly files?: SliceFiles;
}

/** Snapshot of trigger state for status output. */
export interface ITriggerState {
	readonly sliceFires: number;
	readonly thresholdFires: number;
	readonly intervalFires: number;
	readonly manualFires: number;
	readonly lastFiredAt?: string;
}

/**
 * Extract the trigger config for one kind. Returns undefined when
 * the host did not configure that trigger.
 */
export const findTrigger = <K extends TriggerKind>(
	cadence: ICommitPolicyCadence,
	kind: K,
): Extract<ICommitPolicyTrigger, { kind: K }> | undefined => {
	return (cadence.triggers as readonly ICommitPolicyTrigger[]).find(
		(t): t is Extract<ICommitPolicyTrigger, { kind: K }> => t.kind === kind,
	) as Extract<ICommitPolicyTrigger, { kind: K }> | undefined;
};
