import { z } from 'zod';

/**
 * `plugins.commit-policy.options.settlement`.
 *
 * Proposal id prefixes whose slices may commit while a round is
 * `settling`: the repairs that make a red settlement green. Omitted, the
 * proposals plugin's repair prefix applies
 * (`DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES`).
 */
export const SettlementSchema = z.object({
	exemptProposalIdPrefixes: z.array(z.string().min(1)).optional(),
});

export type ICommitPolicySettlement = z.infer<typeof SettlementSchema>;
