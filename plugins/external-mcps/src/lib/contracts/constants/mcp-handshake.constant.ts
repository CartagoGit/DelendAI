import { DELENDAI_VERSION } from '@delendai/core/version';

/**
 * The MCP protocol revision delendai offers a server it boots. A server
 * that speaks another answers with its own, and the session goes on in it.
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** How delendai names itself to the servers it boots. */
export const MCP_CLIENT_INFO = {
	name: 'delendai',
	version: DELENDAI_VERSION,
} as const;
