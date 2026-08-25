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

/** Event emitted by a trigger when it fires. */
export interface ITriggerEvent {
	readonly kind: TriggerKind;
	readonly proposalId?: string;
	readonly sliceId?: string;
	readonly status?: string;
	readonly dirtyCount?: number;
	readonly unpushedCount?: number;
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
