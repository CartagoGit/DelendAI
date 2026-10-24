/**
 * capture-server.ts — the server a plugin registers against when its tools
 * are captured rather than registered directly.
 *
 * The lazy runtimes hand each plugin a stand-in whose `registerTool` only
 * records the tool. It had nothing else, and a plugin that keeps the server
 * it was given, to tell the host something later, kept an object that could
 * not: usage-tracking's session-hygiene advisory failed on every call with
 * `sendLoggingMessage is not a function`, and the advisory never reached an
 * agent. Everything but `registerTool` now goes to the project's live
 * server, read when it is used; before one exists, a log message is dropped
 * rather than thrown.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IHostServerSlot } from '../contracts/interfaces/host-server-slot.interface';

/** A slot the project fills once its server exists. */
export const createHostServerSlot = (): IHostServerSlot => {
	let server: McpServer | undefined;
	return {
		get: () => server,
		set: (value) => {
			server = value;
		},
	};
};

const dropped = async (): Promise<void> => {};

/**
 * A server whose `registerTool` is `registerTool`, and whose every other
 * member is the live server's, bound to it.
 */
export const captureServer = (
	registerTool: (...args: never[]) => unknown,
	live: () => McpServer | undefined = () => undefined,
): McpServer =>
	new Proxy({ registerTool } as object, {
		get(target, property) {
			if (property === 'registerTool') return registerTool;
			const server = live();
			if (server === undefined) {
				return property === 'sendLoggingMessage'
					? dropped
					: Reflect.get(target, property);
			}
			const value: unknown = Reflect.get(server, property);
			return typeof value === 'function'
				? (value as (...args: unknown[]) => unknown).bind(server)
				: value;
		},
	}) as McpServer;
