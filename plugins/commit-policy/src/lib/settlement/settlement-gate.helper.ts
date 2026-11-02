/**
 * settlement-gate.helper.ts — the settlement barrier's engine hooks.
 *
 * Builds the two engine hooks the settlement gate needs from the worker
 * registry and the configured exemption, so the plugin entrypoint wires
 * them in one line and the rule itself is testable without a host.
 */

import {
	DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES,
	SLICE_HOLD_PREFIX,
} from '../contracts/constants/settlement.constant';
import type {
	ISettlementPhase,
	IWorkerRegistry,
} from '../contracts/interfaces/settlement.interface';

interface ISettlementSlice {
	readonly proposalId: string;
	readonly sliceId: string;
}

const holderOf = (slice: ISettlementSlice): string =>
	`${SLICE_HOLD_PREFIX}${slice.proposalId}-${slice.sliceId}`;

export const createSettlementGate = (input: {
	readonly registry: Pick<IWorkerRegistry, 'read' | 'admit' | 'dispose'>;
	readonly exemptProposalIdPrefixes?: readonly string[] | undefined;
}): {
	readonly settlementRead: (
		slice?: ISettlementSlice,
	) => Promise<ISettlementPhase>;
	readonly settlementRelease: (slice: ISettlementSlice) => Promise<void>;
	readonly settlementExempt: (slice: ISettlementSlice) => boolean;
} => {
	const prefixes =
		input.exemptProposalIdPrefixes ??
		DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES;
	return {
		// A registry with no state file reads `active`, so a project that
		// never entered settlement is never gated.
		// A slice is admitted rather than read, so entering settlement
		// waits for its Git work instead of racing it.
		settlementRead: async (slice) =>
			slice === undefined
				? (await input.registry.read()).phase
				: input.registry.admit(holderOf(slice)),
		settlementRelease: (slice) => input.registry.dispose(holderOf(slice)),
		settlementExempt: (slice) =>
			prefixes.some((prefix) => slice.proposalId.startsWith(prefix)),
	};
};
