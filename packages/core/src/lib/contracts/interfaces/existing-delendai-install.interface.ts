/**
 * Result of detecting an existing delendai install in a target workspace
 * (x00201 S2). Contract placement so `detect-existing-install.ts` keeps
 * only the parsing/orchestration logic.
 */
export interface IExistingDelendaiInstall {
	/** True when the workspace already has any delendai wiring (config, or a registered server, or both). */
	readonly existingDelendai: boolean;
	/**
	 * The MCP server's real registration key, when one could be found in
	 * `.vscode/mcp.json` or `.mcp.json`. Undefined when no matching
	 * server entry exists — callers fall back to the greenfield
	 * `mcp-project-<prefix>` default in that case.
	 */
	readonly mcpServerName?: string;
}
