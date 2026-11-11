import z from 'zod';

/** The `IDryRunResult` fields of a tool whose output also carries a preview. */
export const DRY_RUN_PLAN_FIELDS = {
	wouldChange: z
		.array(
			z.object({
				kind: z.enum(['write', 'delete', 'rename', 'create', 'patch']),
				path: z.string(),
				summary: z.string(),
			}),
		)
		.readonly()
		.optional(),
	wouldRun: z
		.array(
			z.object({
				shape: z.enum(['shell', 'network', 'process', 'git', 'mcp']),
				target: z.string(),
				summary: z.string(),
			}),
		)
		.readonly()
		.optional(),
	risk: z.enum(['low', 'medium', 'high']).optional(),
};
