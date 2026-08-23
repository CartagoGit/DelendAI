import z from 'zod';

/**
 * a00085 #13: dashboard webview messages used to be duck-typed. Mirror
 * the agent-catalog Zod union so malformed posts fail `safeParse`.
 */
export const DASHBOARD_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z
		.object({
			command: z.literal('action'),
			action: z.literal('refresh'),
		})
		.strict(),
	z
		.object({
			command: z.literal('openProposal'),
			id: z.string().min(1),
		})
		.strict(),
]);
