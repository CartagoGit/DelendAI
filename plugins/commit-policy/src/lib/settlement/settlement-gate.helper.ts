/**
 * settlement-gate.helper.ts — q00015 S2.
 *
 * Builds the two engine hooks the settlement gate needs from the worker
 * registry and the configured exemption, so the plugin entrypoint wires
 * them in one line and the rule itself is testable without a host.
 */

import { DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES } from '../contracts/constants/settlement.constant';
import type {
	ISettlementPhase,
	IWorkerRegistry,
} from '../contracts/interfaces/settlement.interface';

export const createSettlementGate = (input: {
	readonly registry: Pick<IWorkerRegistry, 'read'>;
	readonly exemptProposalIdPrefixes?: readonly string[] | undefined;
}): {
	readonly settlementRead: () => Promise<ISettlementPhase>;
	readonly settlementExempt: (slice: {
		readonly proposalId: string;
		readonly sliceId: string;
	}) => boolean;
} => {
	const prefixes =
		input.exemptProposalIdPrefixes ??
		DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES;
	return {
		// A registry with no state file reads `active`, so a project that
		// never entered settlement is never gated.
		settlementRead: async () => (await input.registry.read()).phase,
		settlementExempt: (slice) =>
			prefixes.some((prefix) => slice.proposalId.startsWith(prefix)),
	};
};
