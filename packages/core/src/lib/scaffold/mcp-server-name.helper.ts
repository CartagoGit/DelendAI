/**
 * mcp-server-name.helper.ts — how a host refers to an MCP server's tools
 * once it is registered under a name.
 */

/**
 * The reference a Copilot agent's `tools:` grant, and a qualified tool
 * name (`<reference>/<tool>`), must use for the server registered as
 * `serverName`. VS Code derives it from the server's label: lower case,
 * whitespace turned into `-`. Writing the name as registered made a grant
 * like `DelendAI/*` match nothing, so the agent saw none of its tools.
 */
export const hostToolSetReference = (serverName: string): string =>
	serverName.toLowerCase().replace(/\s+/gu, '-');
