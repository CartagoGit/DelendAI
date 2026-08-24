export const MCP_TOOL_SURFACE_MODE = ['native', 'adaptive', 'compact'] as const;

export type IMcpToolSurfaceMode = (typeof MCP_TOOL_SURFACE_MODE)[number];

export const isMcpToolSurfaceMode = (
	value: string | undefined,
): value is IMcpToolSurfaceMode =>
	typeof value === 'string' &&
	(MCP_TOOL_SURFACE_MODE as readonly string[]).includes(value);
