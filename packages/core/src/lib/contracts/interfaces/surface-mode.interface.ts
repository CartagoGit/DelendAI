// `managed` is a canonical mode that keeps the catalog server-side and
// keeps the catalog server-side, exposes only the bootstrap surface to
// the LLM, and uses the `vertex` router to execute tools that are
// available but not listed. `extended` is preserved as a legacy alias
// of `adaptive` to avoid breaking older configs (q00009 d00016 will
// document the migration matrix).
export const MCP_TOOL_SURFACE_MODE = [
	'native',
	'managed',
	'adaptive',
	'compact',
] as const;

export type IMcpToolSurfaceMode = (typeof MCP_TOOL_SURFACE_MODE)[number];

const LEGACY_SURFACE_MODE_ALIASES: Readonly<
	Record<string, IMcpToolSurfaceMode>
> = {
	extended: 'adaptive',
};

export const resolveSurfaceModeAlias = (
	value: string,
): IMcpToolSurfaceMode | undefined => LEGACY_SURFACE_MODE_ALIASES[value];

export const isMcpToolSurfaceMode = (
	value: string | undefined,
): value is IMcpToolSurfaceMode => {
	if (typeof value !== 'string') return false;
	if ((MCP_TOOL_SURFACE_MODE as readonly string[]).includes(value)) {
		return true;
	}
	return resolveSurfaceModeAlias(value) !== undefined;
};

export const coerceSurfaceMode = (
	value: string | undefined,
): IMcpToolSurfaceMode | undefined => {
	if (value === undefined) return undefined;
	if ((MCP_TOOL_SURFACE_MODE as readonly string[]).includes(value)) {
		return value as IMcpToolSurfaceMode;
	}
	return resolveSurfaceModeAlias(value);
};
