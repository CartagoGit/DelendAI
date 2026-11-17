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
	z
		.object({
			command: z.literal('settings'),
			action: z.enum(['save', 'reset']),
			settings: z.record(z.string(), z.unknown()).optional(),
		})
		.strict(),
	z
		.object({
			command: z.literal('logs'),
			action: z.enum(['start', 'stop', 'refresh', 'source', 'filter']),
			source: z.string().optional(),
			outcome: z
				.enum([
					'ok',
					'failed',
					'timed-out',
					'cancelled',
					'dead',
					'idle',
					'unknown',
				])
				.optional(),
			agent: z.string().optional(),
			taskId: z.string().optional(),
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
	z
		.object({
			command: z.literal('settingsResult'),
			settings: z.unknown().optional(),
			error: z.string().optional(),
		})
		.strict(),
	z
		.object({
			command: z.literal('hostLogEvent'),
			source: z.string(),
			event: z.unknown(),
		})
		.strict(),
]);
export type DashboardHostMessage = z.infer<
	typeof DASHBOARD_HOST_MESSAGE_SCHEMA
>;
