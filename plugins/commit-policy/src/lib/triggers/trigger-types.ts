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
 * x00263 (AUD-CP-005): concrete paths attached to a trigger.
 * Always carries the `paths` array — empty arrays are an
 * upstream refusal, never a default. The driver asserts that
 * staged paths ⊆ `paths` after `git add --` runs.
 */
export interface SliceFiles {
	readonly paths: readonly string[];
}

/**
 * Shared shape for trigger events. Specific trigger kinds tighten
 * the required fields below.
 */
interface ITriggerEventBase {
	readonly kind: TriggerKind;
	readonly proposalId?: string;
	readonly sliceId?: string;
	readonly status?: string;
	readonly dirtyCount?: number;
	readonly unpushedCount?: number;
	/**
	 * x00263/x00264: `slice` events carry the paths the slice owns;
	 * `threshold` and `interval` carry the observed dirty paths.
	 * Drivers that receive an event without `files` when one is
	 * required MUST refuse instead of staging a superset.
	 */
	readonly files?: SliceFiles;
}

/** Slice event emitted when a proposal slice reaches a watched status. */
export interface ISliceEvent extends ITriggerEventBase {
	readonly kind: 'slice';
	readonly proposalId: string;
	readonly sliceId: string;
	readonly status: string;
	readonly files: SliceFiles;
}

/** Threshold event emitted when the dirty set meets the configured size. */
export interface ThresholdEvent extends ITriggerEventBase {
	readonly kind: 'threshold';
	readonly dirtyCount: number;
	readonly files: SliceFiles;
}

/** Interval event emitted when enough time elapsed and dirty work exists. */
export interface IIntervalEvent extends ITriggerEventBase {
	readonly kind: 'interval';
	readonly dirtyCount: number;
	readonly files: SliceFiles;
}

/** Manual event emitted by an explicit operator request. */
export interface IManualEvent extends ITriggerEventBase {
	readonly kind: 'manual';
}

/** Event emitted by a trigger when it fires. */
export type ITriggerEvent =
	| ISliceEvent
	| ThresholdEvent
	| IIntervalEvent
	| IManualEvent;

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
