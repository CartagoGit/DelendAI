import z from 'zod';

/**
 * a00084 F31: the agent-catalog webview handler used to duck-type dispatch
 * (`(message as {command?:unknown}).command === 'refresh'`, etc.) instead of
 * validating the whole message shape up front — the same zod-discriminated-
 * union pattern `configuration-center-message-schema.constant.ts` already
 * uses for its own webview. A malformed message (wrong type, missing `id`,
 * extra fields) now fails `safeParse` cleanly instead of silently falling
 * through mismatched branches.
 */
export const AGENT_CATALOG_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z.object({ command: z.literal('refresh') }).strict(),
	z.object({ command: z.literal('copied') }).strict(),
	z
		.object({ command: z.literal('callTool'), id: z.string().min(1) })
		.strict(),
	z
		.object({ command: z.literal('openSkill'), id: z.string().min(1) })
		.strict(),
	z
		.object({ command: z.literal('openProposal'), id: z.string().min(1) })
		.strict(),
]);
