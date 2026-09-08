/**
 * Host-provided subagent runtime.
 *
 * The MCP server can describe and coordinate subagents, but it cannot invent
 * a native host conversation. Hosts inject this capability at assembly time;
 * it is deliberately absent from JSON configuration.
 */
export interface IHostSubagentRequest {
	readonly role: string;
	readonly instruction: string;
	readonly budget: number;
	readonly slotId: string;
	readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface IHostSubagentResult {
	readonly subagentId: string;
	readonly tokensUsed: number;
	readonly output: string;
	readonly schemaOk: boolean;
	readonly hadError: boolean;
}

export interface IHostSubagentRuntime {
	readonly hostId: string;
	readonly spawnSubagent: (
		request: IHostSubagentRequest,
	) => Promise<IHostSubagentResult>;
}
