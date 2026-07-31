/**
 * Single source of truth for the canonical agent slots.
 *
 * Why a separate module:
 *
 *   - `SUBAGENT_SLOTS` in `scaffold/scaffold-host.ts` (core scaffolder) and
 *     `AGENT_CANONICAL_ROLES` in `proposals/shared/agent-conventions.ts`
 *     (runtime registry) were both hand-maintained lists of the same 5 slots
 *     (`orchestrator` + 4 bounded sub-slots). Whenever a slot was added or
 *     renamed, the two lists drifted — agents rendered with one vocabulary
 *     but the IDE picker showed the other, producing the 14-20 duplicated
 *     entries the user reported.
 *
 *   - `core` cannot yet re-export this through `@mcp-vertex/core/public`
 *     because `public/index.ts` is mid-refactor (x00199). Until that
 *     refactor lands, `plugins/proposals/.../agent-conventions.ts`
 *     intentionally DUPLICATES the array. A dedicated lint
 *     (`tools/scripts/lint/agent-slots-in-sync.script.ts`) reads the three
 *     declarations as text and fails `bun run validate` the moment they
 *     diverge, so the duplication cannot drift silently.
 *
 * Conventions:
 *
 *   - Slot names use `snake_case` so they round-trip through
 *     `agent-names` (runtime registry) without a transform.
 *   - The first slot is the orchestrator. The remaining four are the
 *     bounded sub-slots that the orchestrator delegates to.
 *   - The order is preserved by every derived list; tests pin the order
 *     to catch silent reorderings.
 *
 * Adding a new slot:
 *
 *   1. Append it here.
 *   2. Add a kebab-case render in `scaffold/scaffold-host.ts` for every
 *      host you want to emit it on (Copilot/Claude/Codex/Cursor/Continue).
 *   3. Update the scaffolds to honour the new slot in
 *      `scaffoldTool`'s tool-input enum.
 *   4. Add a registry entry in
 *      `plugins/proposals/src/lib/shared/agent-conventions.ts`
 *      (`AGENT_CANONICAL_ROLES`) — the lint will fail if you forget.
 */
export const AGENT_SLOTS = [
	'orchestrator',
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

export type IAgentSlot = (typeof AGENT_SLOTS)[number];

/** Bounded sub-slots only — every slot except the root orchestrator. */
export type ISubagentSlot = Exclude<IAgentSlot, 'orchestrator'>;

/**
 * Runtime-derived subset of `AGENT_SLOTS` minus the orchestrator. The
 * scaffolder iterates this list to emit one adapter file per sub-slot
 * in each supported host's agents directory.
 */
export const SUBAGENT_SLOTS: readonly ISubagentSlot[] = AGENT_SLOTS.filter(
	(slot): slot is ISubagentSlot => slot !== 'orchestrator',
);
