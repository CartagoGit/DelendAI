/**
 * checkpoint-intent.ts — decides whether a checkpoint is a DURABILITY
 * checkpoint or a MERGE CANDIDATE.
 *
 * WHY this is its own function rather than an `if` at the call site: the
 * two are written by the same mechanism to the same ref, so nothing
 * downstream can tell them apart by looking at the commit. If the
 * distinction is not made explicitly, here, once, then a five-minute
 * interval checkpoint of half-finished work eventually reaches the
 * integration engine and a pull request is opened on code the agent was
 * still typing. That failure is silent, and it is the exact failure this
 * plugin exists to prevent.
 *
 * The rule reads two things and nothing else:
 *
 *  - the TRIGGER, which says whether a coherent boundary was reached. A
 *    slice closing is a boundary; a wall clock firing is not, and neither
 *    is a dirty-file threshold — both fire in the middle of an edit.
 *  - `checkpoint.strategy`, which says whether the project's cadence has
 *    slice boundaries at all. Under `interval` the operator has said
 *    "checkpoint on the clock"; a slice event then still gets persisted,
 *    but as durability, because the configured cadence never promised a
 *    coherent unit.
 *
 * `checkpoint.durableWip` is what permits a RED durability checkpoint.
 * It never permits a red candidate: a candidate is validated by the
 * integration engine, which is where redness is supposed to be caught.
 */

import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';

import type {
	ICheckpointClassification,
	IPersistenceTriggerKind,
} from '../contracts/interfaces/persistence.interface';

/** True when this trigger represents a coherent slice boundary. */
const isSliceBoundary = (input: {
	readonly triggerKind: IPersistenceTriggerKind;
	readonly hasSliceSelector: boolean;
}): boolean => {
	if (input.triggerKind === 'slice') return true;
	// A manual commit that names a slice is a deliberate "this unit is
	// done" statement by the caller; a bare manual snapshot is not.
	if (input.triggerKind === 'manual') return input.hasSliceSelector;
	return false;
};

/** Classify one persistence request. */
export const classifyCheckpointIntent = (input: {
	readonly triggerKind: IPersistenceTriggerKind;
	readonly hasSliceSelector: boolean;
	readonly policy: IResolvedDevelopmentPolicy;
}): ICheckpointClassification => {
	const boundary = isSliceBoundary(input);
	const cadenceHasSliceBoundaries =
		input.policy.checkpoint.strategy !== 'interval';
	if (boundary && cadenceHasSliceBoundaries) {
		return {
			intent: 'candidate',
			boundary: input.triggerKind,
			mayBeRed: false,
			eligibleForIntegration: true,
			reason: `${input.triggerKind} trigger closed a slice boundary and checkpoint.strategy=${input.policy.checkpoint.strategy} recognises slice boundaries; this is a merge candidate`,
		};
	}
	const why = boundary
		? `checkpoint.strategy=interval has no slice boundaries, so the ${input.triggerKind} trigger yields durability only`
		: `${input.triggerKind} trigger is not a slice boundary`;
	return {
		intent: 'durability',
		boundary: input.triggerKind,
		mayBeRed: input.policy.checkpoint.durableWip,
		eligibleForIntegration: false,
		reason: `${why}; durability checkpoint, never handed to integration`,
	};
};
