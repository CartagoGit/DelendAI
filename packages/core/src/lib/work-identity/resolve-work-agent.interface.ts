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

/**
 * The channel a claim arrived through: one of the sources above, or one
 * the system has not met (a gateway that stamps requests, a proxy that
 * knows the route). An unknown channel is carried and reported, never
 * coerced to `none`.
 */
export type IWorkAgentChannel = IWorkAgentSource | (string & {});

/**
 * How certain the channel is about who is working: a name something was
 * TOLD (declared), a model a router SAW serving the conversation
 * (observed), or the application that connected (reported). `none` when
 * nothing answered.
 */
export type IWorkAgentConfidence =
	| 'declared'
	| 'observed'
	| 'reported'
	| 'none';

/** The identity, and how specific the thing that supplied it was. */
export interface IWorkAgentIdentity {
	/** Normalised to what a git ref component accepts. */
	readonly id: string;
	readonly source: IWorkAgentSource;
	/** The channel the claim came through; `source` when it is one of the six. */
	readonly channel?: IWorkAgentChannel | undefined;
	readonly confidence?: IWorkAgentConfidence | undefined;
	/**
	 * Why the claim is what it is, in words an operator can act on: an
	 * unresolved claim says whether a program connected or nothing
	 * declared anything at all.
	 */
	readonly reason?: string | undefined;
}

/** One channel the resolver asks, in the order the list declares. */
export interface IWorkAgentChannelRule {
	readonly channel: IWorkAgentChannel;
	/** Which of the six sources a claim from this channel counts as. */
	readonly source: Exclude<IWorkAgentSource, 'policy' | 'none'>;
	readonly confidence: Exclude<IWorkAgentConfidence, 'none'>;
	/** The channel names an application, not a model: marked `client-`. */
	readonly namesApplication?: boolean | undefined;
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
	/** Channels beyond the four above, by name, for a declared precedence to ask. */
	readonly channels?:
		| Readonly<
				Record<string, string | (() => string | undefined) | undefined>
		  >
		| undefined;
}
