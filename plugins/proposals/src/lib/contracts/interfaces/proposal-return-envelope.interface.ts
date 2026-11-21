/**
 * proposal-return-envelope.interface.ts — r00033 S1 pilot adoption.
 *
 * Plugin-scoped narrowing of the shared envelopes in
 * `@delendai/core/contracts` (`EntityRef`, `OperationResult`) to the
 * entity kinds and refusal shape `proposals` actually mints. See
 * `../../returns.ts` for the runtime helpers built on these types.
 */
import type {
	EntityRef,
	OperationResult,
	Refusal,
} from '@delendai/core/contracts';

/** Entity kinds `proposals` mints an `EntityRef` for. */
export type IProposalEntityKind = 'proposal' | 'slice' | 'plan';

/** `EntityRef` narrowed to the kinds this plugin actually produces. */
export type IProposalEntityRef = EntityRef<IProposalEntityKind>;

/** `OperationResult` narrowed with the plugin's default `Refusal` shape. */
export type IProposalOperationResult<T> = OperationResult<T, Refusal>;
