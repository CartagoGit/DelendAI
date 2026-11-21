import type { IPolicyIdentity } from '@delendai/core/cli';

/** Everything that can name the agent of a work ref, most specific first. */
export interface IWorkRefAgentSources {
	readonly model?: string | undefined;
	readonly host?: string | undefined;
	/**
	 * The model the chat provider observed serving this conversation, read
	 * lazily from the provider bridge. Lazy because it touches the
	 * filesystem, and a host that declares its model must never pay for it.
	 */
	readonly provider?: () => string | undefined;
	/** The MCP handshake client name; known only after the handshake. */
	readonly clientName?: () => string | undefined;
	/**
	 * The project's `development.identity` axis (f00758): the same rule the
	 * work engine and the CLI obey, so one project gives one answer about
	 * who is working wherever a ref, a lease or a commit author is named.
	 */
	readonly identity?: IPolicyIdentity | undefined;
	/**
	 * Removed as a source (x00560): a ref named after the machine says
	 * who owns the hardware, and collapses every agent on one machine
	 * into a single name. Core answers `unknown-agent` instead, which is
	 * a fixable statement.
	 */
}

/** A fixed agent id, or one resolved when the ref is named. */
export type IWorkRefAgentId = string | (() => string);
