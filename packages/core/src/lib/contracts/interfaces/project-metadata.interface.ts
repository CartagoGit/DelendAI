/**
 * Identity of an MCP server assembled on top of delendai. The host
 * project provides its own metadata; delendai never hardcodes a name.
 */
export interface IDelendaiProjectMetadata {
	readonly name: string;
	readonly version: string;
	readonly description: string;
}
