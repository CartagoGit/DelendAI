/**
 * Proposal id prefixes whose slices may still commit while a round is
 * `settling`: the proposals plugin files repairs under kind `repair`,
 * prefix `e`. commit-policy does not import that vocabulary, so the
 * value is a configurable default rather than an assumption baked in
 * (`plugins.commit-policy.options.settlement.exemptProposalIdPrefixes`).
 */
export const DEFAULT_SETTLEMENT_EXEMPT_PROPOSAL_ID_PREFIXES: readonly string[] =
	['e'];
