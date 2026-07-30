import z from 'zod';

// x00188 (F21): the agent-catalog webview used to dispatch on duck-typed
// `message.command`/`message.id` with no contract check at all — a
// compromised webview panel could send any shape and probe host-side
// commands. Mirrors CONFIGURATION_CENTER_MESSAGE_SCHEMA's
// discriminatedUnion + .strict() pattern.
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

export type IAgentCatalogMessage = z.infer<typeof AGENT_CATALOG_MESSAGE_SCHEMA>;
