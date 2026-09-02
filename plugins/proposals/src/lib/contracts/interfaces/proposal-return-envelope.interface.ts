/**
 * proposal-return-envelope.interface.ts — r00033 S1 pilot adoption.
 *
 * Plugin-scoped narrowing of the shared envelopes in
 * `@mcp-vertex/core/contracts` (`EntityRef`, `OperationResult`) to the
 * entity kinds and refusal shape `proposals` actually mints. See
 * `../../returns.ts` for the runtime helpers built on these types.
 */
import type {
	EntityRef,
	OperationResult,
	Refusal,
} from '@mcp-vertex/core/contracts';

/** Entity kinds `proposals` mints an `EntityRef` for. */
export type TProposalEntityKind = 'proposal' | 'slice' | 'plan';

/** `EntityRef` narrowed to the kinds this plugin actually produces. */
export type ProposalEntityRef = EntityRef<TProposalEntityKind>;

/** `OperationResult` narrowed with the plugin's default `Refusal` shape. */
export type ProposalOperationResult<T> = OperationResult<T, Refusal>;
