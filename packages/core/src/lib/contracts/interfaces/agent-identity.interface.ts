/**
 * agent-identity.interface.ts — f00082.
 *
 * The composite agent identity is a four-field record that names who
 * is doing work, with what tool, and on which task. The constellation
 * name (`agent_name`) stays primary for human ergonomics; `host`,
 * `model`, and `task_id` are optional and additive so older callers
 * keep compiling and the historical `agent/<agent_name>` branch
 * layout keeps working.
 *
 * The contract lives in the core (not in the proposals plugin)
 * because:
 *   - the worktree engine (which produces the branch name) is a
 *     cross-cutting concern that the swarm tools AND the
 *     `agent_worktree` tool AND the handoff packet all share;
 *   - the core stays the single place that owns durable contracts
 *     other plugins depend on (R1: write tools break a read-only
 *     posture, so the engine is centralised, not duplicated);
 *   - a programmatic host that builds an identity literal
 *     (e.g. in tests) imports from one place.
 *
 * The pure helpers (slugify, compose, parse, nextCollisionSuffix)
 * live in `plugins/proposals/src/lib/shared/agent-identity.ts`
 * because they are agent-registry-specific (collision suffix needs
 * the `git branch --list` enumeration). This file stays a pure
 * type declaration so the core stays "no domain logic" (R1 of
 * AGENTS.md).
 */

/**
 * Known host identifiers. Hosts that have no canonical slug yet
 * pass through as `'unknown'` in the parser (lossy-friendly) and
 * get a clean fallback in the formatter. The list is closed on
 * purpose: a new host MUST be added here so the slug table stays
 * the single source of truth.
 */
export type AgentHost =
	| 'vscode-copilot'
	| 'claude-code'
	| 'codex-cli'
	| 'cursor'
	| 'aider'
	| 'continue'
	| 'unknown';

/**
 * The composite identity. `agent_name` is the only required field;
 * the rest are optional so a caller that does not yet know the
 * host/model/task can still produce a valid identity and fall back
 * to the historical branch layout.
 */
export interface IAgentIdentity {
	/**
	 * Constellation name (`orion`, `andromeda`, ...) OR the manual
	 * host pair the user picks (`copilot-minimax-m3`). Required:
	 * the registry keys on this and the worktree branch always
	 * contains it.
	 */
	readonly agent_name: string;
	/** Which IDE / CLI is driving the agent (e.g. `vscode-copilot`). */
	readonly host?: AgentHost;
	/** Which LLM model is active (e.g. `m3`, `claude-3-5-sonnet`). */
	readonly model?: string;
	/** Current proposal / task the agent is working on. */
	readonly task_id?: string;
}

/**
 * Hard caps for the slug-safe formatters. The composite branch
 * (`agent/<host>-<model>-<agent_name>-<task_id>`) MUST stay under
 * 92 chars so the optional `-<N>` collision suffix and a possible
 * branch-protection prefix (`release/`, `hotfix/`, ...) fit under
 * the POSIX ref-name limit of 255.
 */
export const AGENT_IDENTITY_LIMITS = {
	/** Max chars per field after slugify. */
	perField: 24,
	/** Max chars for the composite slug (the four fields joined by `-`). */
	composite: 92,
} as const;
