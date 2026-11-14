import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * The MCP server a project runs, known once it exists.
 *
 * Plugins are assembled before the server is created, so anything built
 * at assembly time that must reach the host later reads it from here.
 */
export interface IHostServerSlot {
	get(): McpServer | undefined;
	set(server: McpServer): void;
}
