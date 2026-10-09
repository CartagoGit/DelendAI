/** The three answers a gate can give. `unknown` is the default, not `fail`. */
export const ROADMAP_GATE_STATUSES = ['pass', 'fail', 'unknown'] as const;

/** Check conclusions that count as green; anything else a check reports is red. */
export const GREEN_CHECK_CONCLUSIONS: readonly string[] = ['success'];

/** Proposal statuses that mean the work a gate waits for has landed. */
export const DELIVERED_PROPOSAL_STATUSES: readonly string[] = ['done'];
