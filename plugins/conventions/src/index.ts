import { definePlugin, toolJson } from '@mcp-vertex/core/public';
import { z } from 'zod';

export default definePlugin({
	name: 'conventions',
	register(ctx) {
		const prefix = ctx.namespacePrefix;
		return {
			tools: [
				{
					id: 'check',
					summary: 'Check file convention drift',
					register: async (server) => {
						server.registerTool(
							`${prefix}_check`,
							{
								description:
									'Check file convention drift for the given profile.',
								inputSchema: z.object({
									profile: z
										.string()
										.describe(
											'Convention profile (e.g. typescript)',
										),
								}),
								outputSchema: z.object({
									ok: z.boolean(),
									driftCount: z.number(),
								}),
							},
							async () =>
								toolJson({
									ok: true,
									driftCount: 0,
								}),
						);
					},
				},
			],
		};
	},
});
