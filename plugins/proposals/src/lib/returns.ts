/**
 * returns.ts — r00033 S1 pilot adoption.
 *
 * `proposals` is the pilot plugin for the shared envelopes defined in
 * `@mcp-vertex/core/contracts` (Track M / q00006 §46,
 * `packages/core/src/lib/contracts/envelopes.contract.ts`). This module
 * is the plugin-scoped surface: it narrows the generic `EntityRef` to
 * the entity kinds `proposals` actually mints (`proposal`, `slice`),
 * and re-exports the `success`/`failure` constructors so the rest of
 * the plugin has one place to import from instead of reaching into
 * `@mcp-vertex/core/contracts` directly everywhere.
 *
 * This is additive: it does not change any existing tool's wire
 * contract. New return sites (or a future migration of an existing
 * one) can adopt `ProposalOperationResult<T>` / `toProposalEntityRef`
 * without a breaking change, because the underlying shape
 * (`{ ok, value }` / `{ ok, error }`) already matches what most
 * `proposals` tools return today.
 */
import {
	failure,
	success,
	type EntityRef,
	type OperationResult,
	type Refusal,
} from '@mcp-vertex/core/contracts';

/** Entity kinds `proposals` mints an `EntityRef` for. */
export type TProposalEntityKind = 'proposal' | 'slice' | 'plan';

/** `EntityRef` narrowed to the kinds this plugin actually produces. */
export type ProposalEntityRef = EntityRef<TProposalEntityKind>;

/** `OperationResult` narrowed with the plugin's default `Refusal` shape. */
export type ProposalOperationResult<T> = OperationResult<T, Refusal>;

/** Build an `EntityRef` for a proposal, slice, or plan id. */
export const toProposalEntityRef = (
	kind: TProposalEntityKind,
	id: string,
	displayName?: string,
): ProposalEntityRef =>
	displayName === undefined ? { kind, id } : { kind, id, displayName };

/** Re-exported so `proposals` code has one import for the envelope
 * constructors alongside this module's plugin-scoped helpers. */
export const proposalSuccess = success;
export const proposalFailure = failure;
