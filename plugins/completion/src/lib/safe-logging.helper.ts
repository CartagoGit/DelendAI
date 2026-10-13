import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ILoggingMessage = Parameters<McpServer['sendLoggingMessage']>[0];

/**
 * Best-effort `notifications/message` emit.
 *
 * Host stubs (verify:tools capture server, unit fakes) may omit
 * `sendLoggingMessage`. Calling it as a method throws *synchronously*
 * (`x is not a function`) — `.catch` on the promise never runs. Guard
 * both the missing method and rejected promises so the completion
 * reporter never crashes the process.
 */
export const safeSendLoggingMessage = (
	server: McpServer,
	message: ILoggingMessage,
): void => {
	try {
		const send = (
			server as { sendLoggingMessage?: (m: ILoggingMessage) => unknown }
		).sendLoggingMessage;
		if (typeof send !== 'function') return;
		void Promise.resolve(send.call(server, message)).catch(() => undefined);
	} catch {
		// host without a logging channel
	}
};
