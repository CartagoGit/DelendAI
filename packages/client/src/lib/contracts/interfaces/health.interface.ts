/**
 * Typed models for the Health panel (S4 in f126).
 * Wraps `mcp-vertex_proposals_state_health`, `mcp-vertex_proposals_proposal_stale_list`,
 * `mcp-vertex_proposals_agent_names` and `mcp-vertex_status` into a single
 * client-side aggregate.
 */

export interface IServerStateHealth {
	readonly locks: {
		readonly active: number;
	};
	readonly queue: {
		readonly queueLength: number;
		readonly queuedCount: number;
		readonly waiterOrphans: number;
		readonly oldestAgeMinutes: number;
		readonly threshold: string;
	} | null;
	readonly registry: {
		readonly orphans: number;
		readonly threshold: string;
	};
	readonly healthy: boolean;
}

export interface IServerProposalStaleList {
	readonly ok: boolean;
	readonly zombies?: readonly IStaleAgent[];
}

export interface IServerAgentNames {
	readonly agents?: readonly { readonly name: string }[];
	readonly assignments?: readonly {
		readonly agent_name: string;
		readonly status?: 'active' | 'cooldown' | 'orphan';
	}[];
}

export type IStaleKind = 'agent-alive' | 'agent-idle' | 'agent-dead';

export interface IStaleAgent {
	readonly kind: IStaleKind;
	readonly agent: string;
	readonly taskId: string;
	readonly ts: string;
	readonly lastSeen: string;
	readonly missedBeats: number;
	readonly suggestedActions: readonly string[];
}

export interface IHealthSnapshot {
	readonly healthy: boolean;
	readonly locksActive: number;
	readonly queue: {
		readonly length: number;
		readonly queued: number;
		readonly orphans: number;
		readonly oldestAgeMinutes: number;
		readonly threshold: string;
	} | null;
	readonly orphans: number;
	readonly orphansThreshold: string;
	readonly stale: readonly IStaleAgent[];
	readonly staleCount: number;
	readonly agents: readonly string[];
	readonly fetchedAt: string;
}

export interface IHealthOptions {
	/**
	 * If `true`, also call `mcp-vertex_proposals_proposal_stale_list` (extra
	 * round-trip; default `true` because the user almost always
	 * wants the stale list when they open the Health panel).
	 */
	readonly includeStaleList?: boolean;
}
