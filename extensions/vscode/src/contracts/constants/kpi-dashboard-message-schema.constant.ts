import z from 'zod';

/**
 * Messages posted from the KPI dashboard webview to its sidebar provider.
 * Narrow and explicit: refresh or switch the bounded history window.
 */
export const KPI_DASHBOARD_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z
		.object({
			command: z.literal('refresh'),
		})
		.strict(),
	z
		.object({
			command: z.literal('setWindowDays'),
			windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
		})
		.strict(),
]);
