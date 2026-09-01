/**
 * The exact shape a real MCP `tools/list` entry carries on the wire
 * (AUD-B04 / x00284): `name` plus `description` / `inputSchema` /
 * `outputSchema` / `annotations`, matching the MCP SDK's own
 * `ListToolsRequestSchema` handler field-for-field. Shared by
 * `measureToolWireBytes` (`surface/bootstrap.ts`) and
 * `ToolSurfaceRuntime.measureSchemaBytes` — the two measurement paths
 * AUD-B04 collapsed onto one shared byte-counting function — so both
 * describe the same object instead of two hand-rolled partial shapes.
 */
export interface IMcpToolWireDefinition {
	readonly name: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly annotations?: unknown;
	/**
	 * Task-augmented execution preference (MCP SDK `ToolExecutionSchema`).
	 * The SDK's own `server.registerTool` sets this on every registered
	 * tool (defaulting to `{taskSupport: 'forbidden'}`, never left
	 * `undefined`), so it is a real, always-present contributor to wire
	 * bytes — omitting it was the last gap between this shape and what a
	 * live server actually serialises.
	 */
	readonly execution?: unknown;
}
