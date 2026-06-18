/**
 * Identity of an MCP server assembled on top of mcp-vertex. The host
 * project provides its own metadata; mcp-vertex never hardcodes a name.
 */
export interface IMcpVertexProjectMetadata {
	readonly name: string;
	readonly version: string;
	readonly description: string;
}
