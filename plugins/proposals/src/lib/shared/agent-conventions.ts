/**
 * Conventions for the subagent name registry.
 *
 * The registry assigns a known video game title to each subagent that joins
 * the the host project workspace, frees the title when the subagent is done, and
 * keeps a parent -> children tree. These constants drive that lifecycle.
 *
 * `cooldown_days` and `heartbeat_ttl_minutes` cover two failure modes:
 *
 *   - a subagent that finishes but its name should not be reassigned to
 *     another subagent within a small window (avoids human confusion when
 *     reading logs);
 *   - a subagent that crashes without releasing (heartbeat TTL kicks in
 *     and the name is freed by `gc`).
 *
 * `max_depth` caps the parent -> children chain so a runaway orchestrator
 * cannot pile up dozens of nested subagents. The cap is enforced in
 * `assign`; exceeding it returns the legacy compatibility boolean together
 * with `blockerType: 'name-conflict'` and a next action to route around.
 */

export const AGENT_CANONICAL_ROLES = [
	'orchestrator',
	'technical_investigator',
	'proposal_guardian',
	'delivery_verifier',
	'implementation_runner',
] as const;

export type IAgentCanonicalRole = (typeof AGENT_CANONICAL_ROLES)[number];

export const AGENT_CONVENTIONS = {
	cooldown_days: 7,
	heartbeat_ttl_minutes: 10,
	max_depth: 3,
	registry_filename: 'subagent-registry.json',
	registry_version: 1,
} as const;

export type IAgentConventions = typeof AGENT_CONVENTIONS;
