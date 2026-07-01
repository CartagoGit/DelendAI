import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { ISkillCatalog } from '../skills/skill-catalog';
import { toolError, toolJson } from '../shared/tool-response';

/**
 * On-demand access to the project's + active plugins' skills (f00065 slice-B).
 *
 * Without `id`: list every advertised skill as a COMPACT row
 * (id, description = what + when to use, appliesTo, tags). This is what lets an
 * AI know which skills exist and when to reach for one, for a few tokens each —
 * no body is sent.
 *
 * With `id`: return that skill's full SKILL.md body. The body is loaded lazily
 * (the same "fetch only what you need" pattern as the `knowledge` tool), so the
 * AI pays for a body only when it is about to use the skill.
 *
 * The catalog is the single source of truth (`skill-catalog.ts`); this tool
 * does not re-read the manifest or parse frontmatter.
 */
export const buildSkillToolRegistration = (
	namespacePrefix: string,
	catalog: () => ISkillCatalog,
): IToolRegistration => ({
	id: 'skill',
	summary:
		'List the project + active-plugin skills (id, when-to-use), or load one skill body by id. Lazy: read a skill only when you are about to use it.',
	tags: ['orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_skill`,
			{
				description:
					"Discover and use this server's skills (core + active plugins). Without `id`: list every skill as a compact {id, description, appliesTo, tags} row so you know what exists and when to use it — low token cost, no bodies. With `id`: return that skill's full body to follow. Read-only.",
				inputSchema: z.object({ id: z.string().optional() }),
				outputSchema: z.object({
					skills: z
						.array(
							z.object({
								id: z.string(),
								description: z.string(),
								appliesTo: z.array(z.string()),
								tags: z.array(z.string()),
							}),
						)
						.optional(),
					id: z.string().optional(),
					body: z.string().optional(),
				}),
			},
			async (args: { id?: string | undefined }) => {
				const { entries, loadBody } = catalog();
				if (args.id === undefined) {
					return toolJson({
						skills: entries.map((entry) => ({
							id: entry.id,
							description: entry.description,
							appliesTo: [...entry.appliesTo],
							tags: [...entry.tags],
						})),
					});
				}
				const body = await loadBody(args.id);
				if (body === undefined) {
					return toolError(
						`unknown skill id "${args.id}"`,
						'Call without `id` to list available skills.',
					);
				}
				return toolJson({ id: args.id, body });
			},
		);
	},
});
