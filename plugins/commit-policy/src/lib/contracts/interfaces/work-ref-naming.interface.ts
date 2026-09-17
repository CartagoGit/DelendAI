/** Everything that can name the agent of a work ref, most specific first. */
export interface IWorkRefAgentSources {
	readonly model?: string | undefined;
	readonly host?: string | undefined;
	/** The MCP handshake client name; known only after the handshake. */
	readonly clientName?: () => string | undefined;
	readonly machineName: () => string;
}

/** A fixed agent id, or one resolved when the ref is named. */
export type IWorkRefAgentId = string | (() => string);
