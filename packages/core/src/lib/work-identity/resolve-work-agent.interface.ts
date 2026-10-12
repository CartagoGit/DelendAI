/**
 * Where a resolved agent identity came from, most specific first.
 * `policy` is not a discovery: it is the name the project's
 * `development.identity` axis chose for an actor nothing named a model
 * (f00758), and reads as declared because it is.
 */
export type IWorkAgentSource =
	| 'model'
	| 'environment'
	| 'provider'
	| 'client'
	| 'policy'
	| 'none';

/** The identity, and how specific the thing that supplied it was. */
export interface IWorkAgentIdentity {
	/** Normalised to what a git ref component accepts. */
	readonly id: string;
	readonly source: IWorkAgentSource;
}

/**
 * Everything a host can know about who is working. Each may be a value
 * or a function, because the MCP client's name is known only after the
 * handshake. The machine is NOT a source: see the module comment.
 */
export interface IWorkAgentSources {
	/** The exact model, e.g. `claude-opus-5`. */
	readonly model?: string | (() => string | undefined) | undefined;
	/** What the environment declares, e.g. `DELENDAI_AGENT_ID`. */
	readonly environment?: string | (() => string | undefined) | undefined;
	/**
	 * The model the chat provider observed serving this conversation, read
	 * from the provider bridge (see `provider-model-bridge.ts`). An observed
	 * model id, not a client name: the provider that routes the requests
	 * knows exactly which model answered, and publishes it.
	 */
	readonly provider?: string | (() => string | undefined) | undefined;
	/** The name the MCP client reported, e.g. `codex-mcp-client`. */
	readonly client?: string | (() => string | undefined) | undefined;
}
