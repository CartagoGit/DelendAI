import type { IPromptRegistration } from '../contracts/interfaces/tool-registration.interface';

/**
 * A workflow prompt that gives clients a one-click "get started" entry
 * (slash-command-like UX). It simply tells the agent to call the
 * `overview` tool first and then follow the recommended next action —
 * the cheapest possible orientation for any model.
 */
export const buildStartPromptRegistration = (
	namespacePrefix: string,
	recommendedNextAction: () => string,
): IPromptRegistration => ({
	id: 'start',
	register: async (server) => {
		server.registerPrompt(
			`${namespacePrefix}_start`,
			{
				description:
					'Orient yourself in this project and start working efficiently.',
			},
			async () => ({
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: [
								`Call \`${namespacePrefix}_overview\` first to map this server (tools, plugins, knowledge).`,
								`Then: ${recommendedNextAction()}`,
								'Prefer the MCP tools over re-deriving anything; keep each step small and validate before closing.',
							].join('\n'),
						},
					},
				],
			}),
		);
	},
});
