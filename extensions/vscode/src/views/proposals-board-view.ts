/**
 * proposals-board-view.ts — f00097 VS Code proposals board (read-only).
 *
 * S1 (this slice): the **read-only tool whitelist** that every part of the
 * proposals UI (sidebar board, detail webview, and the web-parity route) is
 * allowed to call. This is the CONTRACT between f00097 and the proposals
 * plugin: the UI observes state, it never mutates it. Moving a proposal,
 * claiming a slice, transitioning status, or syncing the registry stays in
 * the agent / CLI where `agent_lock` and the transition DFA enforce
 * ownership.
 *
 * The names below are the plugin-qualified suffixes (WITHOUT the host
 * namespace prefix). Call sites qualify them with the configured prefix via
 * `formatToolName(namespacePrefix, suffix)` from `@delendai/client`, so
 * the whitelist stays correct even when a host renames the prefix.
 *
 * The canonical rationale (per-tool, allow/deny) lives in
 * `docs/delendai/PLUGINS-DELENDAI.md` → "VS Code read-only proposals
 * surface". Keep the two in sync; S6 greps this module for the denied names.
 *
 * S2 EVOLVES the existing `ProposalBoardProvider`
 * (`providers/proposal-board-provider.ts`, shipped by f00079 S4) rather than
 * adding a parallel provider here; the shared read-only data layer lives in
 * `lib/proposals-snapshot.ts`. Both, and the S3 detail webview, route every
 * tool call through the whitelist below.
 */

/**
 * Tools the proposals UI MAY call. Read-only: each only reads/derives state.
 * Board vs detail scoping (which surface may call which) is documented in the
 * PLUGINS design note; both surfaces draw from this same set.
 */
export const READ_ONLY_TOOLS = [
	// Primary list source — every proposal with its status/kind/track.
	'proposals_proposal_board',
	// Per-proposal diagnosis (detail webview only).
	'proposals_proposal_diagnose',
	// Aggregated swarm health: locks + queue backpressure + proposal counts.
	'proposals_compact_status',
	// Recovery hints + lock/orphan snapshot for the header chip.
	'proposals_state_health',
	// "stale > 7d" badge source.
	'proposals_proposal_stale_list',
	// Redacted, point-in-time log tail (detail webview, filtered by proposal).
	'logs_tail',
	// Agents currently adopted on proposals (detail webview chips).
	'proposals_agent_names',
] as const;

export type ReadOnlyProposalToolSuffix = (typeof READ_ONLY_TOOLS)[number];

/**
 * Tools the proposals UI MUST NOT call — they mutate proposal / lock / queue
 * state. Listed explicitly (not just "everything else") so a reviewer and the
 * S6 verification spec can grep for exactly the forbidden surface. Adding any
 * of these to a UI call path is a bug, not a feature.
 */
export const MUTATING_TOOLS_DENIED = [
	'proposals_proposal_transition',
	'proposals_agent_lock',
	'proposals_close_slice',
	'proposals_sync_proposals',
] as const;

const READ_ONLY_SET: ReadonlySet<string> = new Set(READ_ONLY_TOOLS);

/**
 * Guard the UI uses before issuing any tool call: only whitelisted read-only
 * proposal tools pass. Narrows to the suffix union so callers can pass the
 * result straight to `formatToolName`.
 */
export const isReadOnlyProposalTool = (
	suffix: string,
): suffix is ReadOnlyProposalToolSuffix => READ_ONLY_SET.has(suffix);
