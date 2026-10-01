/** Everything that can name the agent of a work ref, most specific first. */
export interface IWorkRefAgentSources {
	readonly model?: string | undefined;
	readonly host?: string | undefined;
	/** The MCP handshake client name; known only after the handshake. */
	readonly clientName?: () => string | undefined;
	/**
	 * Removed as a source (x00560): a ref named after the machine says
	 * who owns the hardware, and collapses every agent on one machine
	 * into a single name. Core answers `unknown-agent` instead, which is
	 * a fixable statement.
	 */
}

/** A fixed agent id, or one resolved when the ref is named. */
export type IWorkRefAgentId = string | (() => string);
