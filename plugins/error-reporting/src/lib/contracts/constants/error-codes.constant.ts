export const MCP_VERTEX_ERROR_CODES = [
	'PLUGIN_REGISTER_TIMEOUT',
	'PLUGIN_LOAD_FAILED',
	'PLUGIN_DISPOSE_FAILED',
	'TOOL_EXECUTION_FAILED',
	'HOOK_FAILED',
	'INVALID_OPTIONS',
	'MUTEX_STALE_LOCK',
	'PROCESS_TIMEOUT',
] as const;

export type McpVertexErrorCode = (typeof MCP_VERTEX_ERROR_CODES)[number];

export const isMcpVertexErrorCode = (
	value: unknown,
): value is McpVertexErrorCode =>
	typeof value === 'string' &&
	(MCP_VERTEX_ERROR_CODES as readonly string[]).includes(value);
