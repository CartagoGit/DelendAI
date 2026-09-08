/**
 * generation.ts — `StateGeneration` + fencing.
 *
 * x00530 S1: the declarations moved to
 * `@delendai/contracts/state` (they are part of the transitive
 * type closure of `IStateRegistry`, which `@delendai/core`
 * publishes on its plugin contract). This module re-exports them
 * so every existing import path keeps resolving.
 */

export type {
	IGenerationStatus,
	IGenerationId,
	IProjectLeaseToken,
	ISwarmLeaseToken,
	IGenerationHolder,
	GenerationFenceRejection,
	IFenceAccepted,
	IFenceRejected,
	GenerationFenceOutcome,
	StateGeneration,
	IHydrateFailureReason,
	TDriftDirection,
	IStateStoreFailure,
	IHydrateResult,
} from '@delendai/contracts/state';
