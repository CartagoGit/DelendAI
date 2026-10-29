import type {
	MCP_TRANSPORT_ERROR_CODES,
	MCP_TRANSPORT_ERROR_KINDS,
} from '../constants/mcp-transport-error.constant';

export type McpTransportErrorKind = (typeof MCP_TRANSPORT_ERROR_KINDS)[number];

export type McpTransportErrorCode =
	(typeof MCP_TRANSPORT_ERROR_CODES)[McpTransportErrorKind];

export interface IMcpTransportError {
	readonly kind: McpTransportErrorKind;
	readonly code: McpTransportErrorCode;
	readonly cause?: unknown;
}
