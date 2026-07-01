/**
 * Maps agent roles to model identifiers. The host decides which
 * models exist (in the host project the default is `MiniMax-M3
 * (customendpoint)`); mcp-vertex only serves the table.
 */
export interface IModelRoute {
	/** Host-defined role, e.g. `orchestrator`, `implementation_runner`. */
	readonly role: string;
	/** Model identifier as the agent host expects it. */
	readonly model: string;
	readonly reason?: string | undefined;
}

export interface IModelRoutingTable {
	/** Model used when no route matches a role. */
	readonly defaultModel: string;
	readonly routes: readonly IModelRoute[];
}
