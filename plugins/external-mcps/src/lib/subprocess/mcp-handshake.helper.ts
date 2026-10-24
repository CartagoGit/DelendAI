/**
 * mcp-handshake.helper.ts — the session opening an MCP client owes a
 * server before any request: `initialize`, its answer, then
 * `notifications/initialized`. A conforming server refuses `tools/call`
 * before it, so a registry that called tools straight away worked only
 * against stubs.
 */
import {
	MCP_CLIENT_INFO,
	MCP_PROTOCOL_VERSION,
} from '../contracts/constants/mcp-handshake.constant';
import type { IHandshakeInput } from '../contracts/interfaces/mcp-handshake.interface';

/** Opens the session; settles with `undefined`, or why it could not. */
export const openMcpSession = (
	input: IHandshakeInput,
): Promise<string | undefined> =>
	new Promise((resolve) => {
		input.waiters.set(input.id, (message) => {
			const failure =
				message.error === undefined
					? undefined
					: `"${input.server}" did not open an MCP session: ${message.error.message}`;
			if (failure === undefined) {
				input.send({
					jsonrpc: '2.0',
					method: 'notifications/initialized',
				});
			}
			input.onSettled(failure);
			resolve(failure);
		});
		input.send({
			jsonrpc: '2.0',
			id: input.id,
			method: 'initialize',
			params: {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: MCP_CLIENT_INFO,
			},
		});
	});
