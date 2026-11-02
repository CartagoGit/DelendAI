/**
 * registry.ts — `IStateRegistry` public contract.
 *
 * x00530 S1: the declarations moved to
 * `@delendai/contracts/state`. `@delendai/core` exposes
 * `IStateRegistry` on `IPluginContext.state`, which is PUBLIC
 * surface, and `@delendai/core` must not reach into this package
 * for it. This module re-exports the contract verbatim so every
 * existing `@delendai/state` / `@delendai/state/registry` import
 * keeps resolving — including `@delendai/state-sqlite` and
 * `@delendai/proposals-sqlite`.
 */

export type {
	IProjectLeaseHandle,
	ISwarmClaimHandle,
	IReadResult,
	IHydrateInput,
	IStateRegistry,
	ISnapshotIssue,
	IStateClock,
	IStateRegistryOptions,
	IProjectionRoot,
} from '@delendai/contracts/state';
