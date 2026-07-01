/**
 * provider-capabilities.interface.ts — f00067 S1.
 *
 * The single canonical contract for the multi-model orchestrator. Every
 * wiki page (04/05/06/07/08) and both consuming plugins
 * (`orchestrator-runner`, `usage-tracking`) import the provider vocabulary
 * from here so there is no drift between the design text and the code.
 *
 * The contract lives in the core (not in a plugin) because:
 *   - it is a public API of `@mcp-vertex/core`: once shipped it becomes a
 *     durable contract other plugins depend on (see f00037);
 *   - the catalog snapshot (a core concern) surfaces `IProviderSummary`
 *     to agents via `<prefix>_overview` / `<prefix>_agent_catalog`
 *     (a00032 S4 follow-up);
 *   - the swarm slice contract (`IProposalSliceContract`) references
 *     `CapabilityTag` from a slice's `requires_capability` hints (f00067 S2).
 *
 * The file stays a pure type declaration so the core keeps its "no domain
 * logic, no vendor vocabulary" posture (AGENTS.md rule 1). It defines
 * `command`/`server`/`modelId` as plain strings — the concrete vendor
 * knowledge (which CLIs exist, which MCP servers, which models) lives in
 * the runner plugin under `plugins/orchestrator-runner/`.
 */

/**
 * Task-shaped capability the router matches a slice or invocation against.
 * A slice can declare `requires_capability: [code-edit, fast-iteration]`
 * and the runner scores providers by how well their `strengths` cover it.
 */
export type CapabilityTag =
	| 'code-edit'
	| 'long-context'
	| 'very-long-context'
	| 'architecture'
	| 'security-audit'
	| 'reasoning'
	| 'vision'
	| 'fast-iteration'
	| 'json-strict'
	| 'multilingual'
	| 'agentic'
	| 'summarization';

export const CAPABILITY_TAGS: readonly CapabilityTag[] = [
	'code-edit',
	'long-context',
	'very-long-context',
	'architecture',
	'security-audit',
	'reasoning',
	'vision',
	'fast-iteration',
	'json-strict',
	'multilingual',
	'agentic',
	'summarization',
];

/** How the orchestrator reaches the model backing a provider. */
export type ProviderKind =
	| 'api' // HTTP API (user has a key in env)
	| 'subscription' // Claude Code / Codex / Copilot / Cursor subscription
	| 'cli' // spawn a CLI process (aider, cn, agent)
	| 'mcp-server'; // spawn an MCP server (codex mcp-server) and call it as a tool

/**
 * Discriminated union on `kind` (CRITICAL C6 fix): `invoke` is not a bare
 * string — the discriminator picks the right shape so the runner cannot
 * mix, e.g., an api `url` with a cli `command`.
 */
export type IProviderInvoke =
	| {
			readonly kind: 'api';
			readonly url: string;
			readonly method?: 'GET' | 'POST';
			readonly envVar: string;
	  }
	| {
			readonly kind: 'subscription';
			readonly tool:
				| 'vscode-copilot'
				| 'claude-code'
				| 'codex'
				| 'cursor';
	  }
	| {
			readonly kind: 'cli';
			readonly command: string;
			readonly args?: readonly string[];
	  }
	| {
			readonly kind: 'mcp-server';
			readonly server: string;
			readonly tool: string;
			readonly args: Readonly<Record<string, unknown>>;
	  };

/** The cost tier of a provider, 1 (cheapest) … 5 (most expensive). */
export type CostTier = 1 | 2 | 3 | 4 | 5;

/** The full capability record for a single provider in the roster. */
export interface IProviderCapabilities {
	readonly id: string; // kebab-case, unique
	readonly kind: ProviderKind;
	readonly invoke: IProviderInvoke;
	readonly modelId: string;
	readonly contextWindow: number;
	readonly costTier: CostTier;
	readonly strengths: ReadonlyArray<CapabilityTag>;
	readonly weaknesses: ReadonlyArray<CapabilityTag>;
}

/**
 * Cheap summary surfaced to agents via `<prefix>_overview` /
 * `<prefix>_agent_catalog`. `reachable` is a one-line projection of
 * `IProviderAvailability.state === 'available'`, computed at request time
 * and never stored (see the reconciliation note in wiki/07).
 */
export interface IProviderSummary {
	readonly id: string;
	readonly kind: ProviderKind;
	readonly modelId: string;
	readonly costTier: CostTier;
	readonly reachable: boolean;
	readonly strengths: ReadonlyArray<CapabilityTag>;
}

/** The runtime states a provider can be in. */
export type ProviderState =
	| 'available'
	| 'quota-exceeded'
	| 'rate-limited'
	| 'unauthenticated'
	| 'not-installed'
	| 'model-unavailable'
	| 'error';

/**
 * Rich runtime state for a provider. Owned by the runner; mirrored
 * in-memory to avoid fs reads on the hot path. The on-disk file
 * (`healthcheck.json`) is for next-boot recovery only.
 */
export interface IProviderAvailability {
	readonly id: string;
	readonly state: ProviderState;
	readonly until?: string; // ISO timestamp; only for time-bound states
	readonly reason?: string; // human-readable
	readonly lastFailure?: {
		readonly code: string;
		readonly message: string;
		readonly at: string;
	};
}

/** How the runner reaches the chosen model for a routing decision. */
export type RoutingStrategy =
	| 'passthrough' // use the current agent's model, zero extra spend
	| 'api' // direct HTTP call (requires executeApi + confirmBeforeExecute)
	| 'cli' // spawn a subprocess (claude -p, codex exec, aider --message, cn -p)
	| 'mcp-tool' // spawn an MCP server, call it as a tool
	| 'handoff'; // generate a command for the user to run

export type RoutingMode = 'plan' | 'explore' | 'implement' | 'review';

export interface IRoutingScoreEntry {
	readonly provider: string;
	readonly score: number;
	readonly reasons: ReadonlyArray<string>;
}

export interface IRoutingDecision {
	readonly strategy: RoutingStrategy;
	readonly targetProvider: IProviderCapabilities;
	readonly mode: RoutingMode;
	readonly prompt: string;
	readonly invoke: IProviderInvoke;
	readonly rationale: string;
	readonly estimatedCostTier: CostTier;
	readonly alternates: ReadonlyArray<IRoutingDecision>; // top 2 backups
	readonly scoringTrace: ReadonlyArray<IRoutingScoreEntry>;
	readonly sessionId: string;
}
