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
import type { IJsonRpcMessage } from './server-registry';

export interface IHandshakeInput {
	/** The request id of `initialize`. */
	readonly id: number;
	readonly server: string;
	readonly send: (message: IJsonRpcMessage) => void;
	readonly waiters: Map<number | string, (message: IJsonRpcMessage) => void>;
	/** Told at once when the server answers: `undefined`, or why it failed. */
	readonly onSettled: (failure: string | undefined) => void;
}

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
