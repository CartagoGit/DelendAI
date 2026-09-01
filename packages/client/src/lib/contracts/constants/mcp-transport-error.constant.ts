export const MCP_TRANSPORT_ERROR_KINDS = [
	'timeout',
	'cancellation',
	'invalid-payload',
	'protocol',
	'tool-error',
	'server-exit',
] as const;

export const MCP_TRANSPORT_ERROR_CODES = {
	timeout: 'mcp-timeout',
	cancellation: 'mcp-cancellation',
	'invalid-payload': 'mcp-invalid-payload',
	protocol: 'mcp-protocol',
	'tool-error': 'mcp-tool-error',
	'server-exit': 'mcp-server-exit',
} as const satisfies Record<(typeof MCP_TRANSPORT_ERROR_KINDS)[number], string>;
