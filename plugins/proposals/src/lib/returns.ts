/**
 * returns.ts — r00033 S1 pilot adoption.
 *
 * `proposals` is the pilot plugin for the shared envelopes defined in
 * `@delendai/core/contracts` (Track M / q00006 §46,
 * `packages/core/src/lib/contracts/envelopes.contract.ts`). This module
 * is the plugin-scoped surface: it re-exports the `success`/`failure`
 * constructors and a helper that mints an `EntityRef` narrowed to the
 * entity kinds `proposals` actually produces (see
 * `contracts/interfaces/proposal-return-envelope.interface.ts` for the
 * types — inline exported types live under `contracts/` per this
 * repo's `lint:types-in-contracts` convention).
 *
 * This is additive: it does not change any existing tool's wire
 * contract. New return sites (or a future migration of an existing
 * one) can adopt `IProposalOperationResult<T>` / `toProposalEntityRef`
 * without a breaking change, because the underlying shape
 * (`{ ok, value }` / `{ ok, error }`) already matches what most
 * `proposals` tools return today.
 */
import { failure, success } from '@delendai/core/contracts';

import type {
	IProposalEntityRef,
	IProposalEntityKind,
} from './contracts/interfaces/proposal-return-envelope.interface';

/** Build an `EntityRef` for a proposal, slice, or plan id. */
export const toProposalEntityRef = (
	kind: IProposalEntityKind,
	id: string,
	displayName?: string,
): IProposalEntityRef =>
	displayName === undefined ? { kind, id } : { kind, id, displayName };

/** Re-exported so `proposals` code has one import for the envelope
 * constructors alongside this module's plugin-scoped helpers. */
export const proposalSuccess = success;
export const proposalFailure = failure;
