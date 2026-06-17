/**
 * Identity of an MCP server assembled on top of mcp-core. The host
 * project provides its own metadata; mcp-core never hardcodes a name.
 */
export interface IMcpCoreServerMetadata {
    readonly name: string;
    readonly version: string;
    readonly description: string;
}
