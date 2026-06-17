/**
 * Canonical **minimum** shape of the `swarmBudget` and
 * `continuityPolicy` blocks in proposal frontmatter. A proposal may
 * declare additional keys (e.g. the `maxTurnTokens` extension from
 * `swarm-types.ts`), but it MUST declare at least the keys enumerated
 * here, with the right type, for the cascade to trust the policy.
 *
 * Pure data + small type guards. This module MUST NOT perform I/O,
 * spawn subprocesses, read environment variables, or call
 * `process.cwd()`. Closed key sets are `as const` arrays (no enums).
 *
 * Moved from the host project knowledge
 * (the proposal-budget policy): the
 * guards are framework mechanics, not host policy content.
 */

// ---------------------------------------------------------------------------
// swarmBudget (minimum required keys)
// ---------------------------------------------------------------------------

/**
 * The minimum set of keys a `swarmBudget` block MUST contain. Any
 * proposal whose `swarmBudget` is missing one of these keys (or has a
 * non-integer value) is considered out of policy and
 * `isProposalSwarmBudget` returns `false`. Extra keys are allowed.
 */
export const SWARM_BUDGET_KEYS = [
	'maxSessionsActive',
	'maxAgentsPerSession',
	'maxToolRetriesPerSession',
	'maxCoreDocRereadsPerSession',
] as const;

export type ISwarmBudgetKey = (typeof SWARM_BUDGET_KEYS)[number];

const SWARM_BUDGET_KEY_SET: ReadonlySet<string> = new Set(SWARM_BUDGET_KEYS);

export function isProposalSwarmBudget(
	value: unknown
): value is Record<ISwarmBudgetKey, number> & Record<string, unknown> {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const record = value as Record<string, unknown>;
	for (const key of SWARM_BUDGET_KEY_SET) {
		if (!(key in record)) {
			return false;
		}
		const v = record[key];
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
			return false;
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// continuityPolicy (minimum required keys)
// ---------------------------------------------------------------------------

/**
 * The minimum set of keys a `continuityPolicy` block MUST contain. All
 * values are booleans. `forbidNewProposals: true` is the audit-cascade's
 * hard rule; `forbidReReadOnUnchangedDigest: true` is the round-context
 * digest's core optimization. Extra keys are allowed.
 */
export const CONTINUITY_POLICY_KEYS = [
	'forbidNewProposals',
	'requireCheckpointAfterTask',
	'forbidReReadOnUnchangedDigest',
] as const;

export type IContinuityPolicyKey = (typeof CONTINUITY_POLICY_KEYS)[number];

const CONTINUITY_POLICY_KEY_SET: ReadonlySet<string> = new Set(
	CONTINUITY_POLICY_KEYS
);

export function isProposalContinuityPolicy(
	value: unknown
): value is Record<IContinuityPolicyKey, boolean> & Record<string, unknown> {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const record = value as Record<string, unknown>;
	for (const key of CONTINUITY_POLICY_KEY_SET) {
		if (!(key in record)) {
			return false;
		}
		if (typeof record[key] !== 'boolean') {
			return false;
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// Combined frontmatter block
// ---------------------------------------------------------------------------

/**
 * Convenience type for the slice of proposal frontmatter that this
 * module validates. Real proposals also carry `id`, `status`, `track`,
 * `budget`, `acceptanceCriteria`, etc.; those are out of scope here.
 *
 * Extra keys in either block are allowed and preserved at the type
 * level via `Record<string, unknown>`.
 */
export interface IProposalBudgetPolicy {
	readonly swarmBudget: Record<ISwarmBudgetKey, number> &
		Record<string, unknown>;
	readonly continuityPolicy: Record<IContinuityPolicyKey, boolean> &
		Record<string, unknown>;
}

export function isProposalBudgetPolicy(
	value: unknown
): value is IProposalBudgetPolicy {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		isProposalSwarmBudget(record.swarmBudget) &&
		isProposalContinuityPolicy(record.continuityPolicy)
	);
}
