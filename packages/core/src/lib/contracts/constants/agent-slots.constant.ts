/**
 * Canonical agent slots (f00037 contract placement — single source).
 *
 * Kept in contracts/constants so the slot list is a first-class contract,
 * not an inline export of an implementation module. `agent-slots.ts`
 * re-exports this for backwards compatibility while the `public/index.ts`
 * refactor (x00199) lands.
 *
 * Conventions:
 *   - Slot names use `snake_case` so they round-trip through `agent-names`.
 *   - The first slot is the orchestrator; the remaining four are the
 *     bounded sub-slots the orchestrator delegates to.
 *   - Order is preserved by every derived list; tests pin it.
 */
export const AGENT_SLOTS = [
	'orchestrator',
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

/** Runtime-derived subset of `AGENT_SLOTS` minus the orchestrator. */
export const SUBAGENT_SLOTS = AGENT_SLOTS.filter(
	(slot): slot is Exclude<(typeof AGENT_SLOTS)[number], 'orchestrator'> =>
		slot !== 'orchestrator',
);
