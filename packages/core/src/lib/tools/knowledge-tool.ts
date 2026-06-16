import { z } from 'zod';

import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolError, toolJson } from '../shared/tool-response';

/**
 * On-demand access to the knowledge contributed by plugins. Listing
 * returns only ids+titles (cheap); fetching one returns its body. This
 * keeps an agent's context small: it reads a doc only when it needs it,
 * instead of paying for every plugin's prose up front.
 */
export const buildKnowledgeToolRegistration = (
	namespacePrefix: string,
	knowledge: () => readonly IKnowledgeEntry[]
): IToolRegistration => ({
	id: 'knowledge',
	summary:
		'List knowledge ids/titles, or fetch one entry by id. Lazy: read a doc only when needed.',
	tags: ['orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_knowledge`,
			{
				description:
					'Access plugin knowledge on demand. Without `id`: list every entry as {id,title}. With `id`: return that entry. Read-only and low-token (fetch only what you need).',
				inputSchema: z.object({ id: z.string().optional() }),
					outputSchema: z.object({
						entries: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
						id: z.string().optional(),
						title: z.string().optional(),
						body: z.string().optional(),
					}),
			},
			async (args: { id?: string | undefined }) => {
				const entries = knowledge();
				if (args.id === undefined) {
					return toolJson({
						entries: entries.map((entry) => ({
							id: entry.id,
							title: entry.title,
						})),
					});
				}
				const found = entries.find((entry) => entry.id === args.id);
				if (found === undefined) {
					return toolError(
						`unknown knowledge id "${args.id}"`,
						'Call without `id` to list available ids.'
					);
				}
				return toolJson(found);
			}
		);
	},
});
