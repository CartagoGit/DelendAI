import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ILoggingMessage = Parameters<McpServer['sendLoggingMessage']>[0];

/**
 * Best-effort `notifications/message` emit.
 *
 * Host stubs (verify:tools capture server, unit fakes) may omit
 * `sendLoggingMessage`. Calling it as a method throws *synchronously*
 * (`x is not a function`) — `.catch` on the promise never runs. Guard
 * both the missing method and rejected promises so the completion
 * reporter never crashes the process. Resolves whether the message was
 * handed to the host: a caller that reports a notification must not claim
 * one the host never took.
 */
export const safeSendLoggingMessage = async (
	server: McpServer,
	message: ILoggingMessage,
): Promise<boolean> => {
	try {
		const send = (
			server as { sendLoggingMessage?: (m: ILoggingMessage) => unknown }
		).sendLoggingMessage;
		if (typeof send !== 'function') return false;
		await send.call(server, message);
		return true;
	} catch {
		// host without a logging channel, or one that refused the message
		return false;
	}
};
