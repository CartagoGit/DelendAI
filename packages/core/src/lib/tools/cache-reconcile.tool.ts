import z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolJson } from '../shared/tool-response';
import type { ICacheLayoutBootstrapResult } from '../cache/cache-layout-bootstrap';

export const buildCacheReconcileToolRegistration = (input: {
	namespacePrefix: string;
	reconcile: (apply: boolean) => Promise<ICacheLayoutBootstrapResult>;
}): IToolRegistration => ({
	id: 'cache_reconcile',
	summary:
		'Inspect or repair plugin cache locations against the resolved core cache root.',
	tags: ['configuration', 'cache'],
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_cache_reconcile`,
			{
				description:
					'Inspect or repair runtime cache locations. With apply:false, returns pending migrations; with apply:true, moves legacy plugin cache data into the resolved core cache root without overwriting existing files.',
				inputSchema: z
					.object({ apply: z.boolean().optional() })
					.strict(),
				outputSchema: z.object({
					cacheDirAbs: z.string(),
					created: z.array(z.string()),
					migrated: z.array(
						z.object({ from: z.string(), to: z.string() }),
					),
					pending: z.array(
						z.object({ from: z.string(), to: z.string() }),
					),
				}),
			},
			async (args) =>
				toolJson(await input.reconcile(args.apply === true)),
		);
	},
});
