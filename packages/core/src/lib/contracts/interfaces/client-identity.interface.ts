/**
 * The MCP client driving this process, as it named itself at the
 * handshake (`clientInfo.name`: `claude-code`, `Visual Studio Code`,
 * `codex-mcp-client`, ...).
 *
 * Unlike {@link IResolvedHostIdentity}, nothing has to be configured: every
 * MCP client reports its name, so a plugin that records who did something
 * can tell hosts apart in Claude, Codex, Copilot or any other client. The
 * name is known only after the handshake, which happens after plugins
 * register, so it is read through a function at the moment it is needed.
 */
export interface IClientIdentity {
	/** The handshake client name, or `undefined` before the handshake. */
	readonly name: () => string | undefined;
}
