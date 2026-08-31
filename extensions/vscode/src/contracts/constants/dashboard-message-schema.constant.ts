import z from 'zod';

/**
 * a00085 #13: dashboard webview messages used to be duck-typed. Mirror
 * the agent-catalog Zod union so malformed posts fail `safeParse`.
 */
export const DASHBOARD_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z
		.object({
			command: z.literal('action'),
			action: z.enum(['refresh', 'expand']),
		})
		.strict(),
	z
		.object({
			command: z.literal('openProposal'),
			id: z.string().min(1),
		})
		.strict(),
	z
		.object({
			command: z.literal('openTool'),
			name: z.string().min(1),
		})
		.strict(),
	z
		.object({
			command: z.literal('openSurface'),
			surface: z.enum([
				'proposals',
				'knowledge',
				'configuration',
				'settings',
			]),
		})
		.strict(),
]);

/**
 * Messages the host pushes INTO the dashboard webview. These are
 * posted by `DashboardWebviewViewProvider` after a tool/proposal
 * detail payload has been loaded so the shell renders the detail
 * inside its own overlay instead of opening a standalone webview
 * panel.
 */
export const DASHBOARD_HOST_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z
		.object({
			command: z.literal('hostToolDetail'),
			model: z.unknown(),
		})
		.strict(),
	z
		.object({
			command: z.literal('hostProposalDetail'),
			model: z.unknown(),
		})
		.strict(),
	z
		.object({
			command: z.literal('hostHideDetail'),
		})
		.strict(),
]);
export type DashboardHostMessage = z.infer<
	typeof DASHBOARD_HOST_MESSAGE_SCHEMA
>;
