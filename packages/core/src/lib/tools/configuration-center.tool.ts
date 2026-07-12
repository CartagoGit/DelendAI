import { z } from 'zod';

import type { IConfigurationCenterSnapshot } from '../contracts/interfaces/configuration-center.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolJson } from '../shared/tool-response';
import { readConfigurationCenterSection } from '../configuration-center/configuration-center';

const SECTION = z.enum(['summary', 'config', 'plugins', 'artifacts']);
const ORIGIN = z.enum(['bundled', 'user-local', 'external']);
const ARTIFACT_KIND = z.enum([
	'agent',
	'skill',
	'prompt',
	'resource',
	'knowledge',
]);
const PAGE = z.object({
	cursor: z.number().int().nonnegative(),
	nextCursor: z.number().int().nonnegative().nullable(),
	total: z.number().int().nonnegative(),
});

export const buildConfigurationCenterToolRegistration = (
	namespacePrefix: string,
	snapshot: () => IConfigurationCenterSnapshot,
): IToolRegistration => ({
	id: 'configuration_center',
	summary:
		'Inspect project config, plugins and owned artifacts lazily with provenance.',
	tags: ['configuration', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_configuration_center`,
			{
				description:
					'Lazy, read-only Configuration Center introspection. Start with section=summary; request config, plugins or artifacts only when needed. Lists are paginated.',
				inputSchema: z.object({
					section: SECTION.optional(),
					cursor: z.number().int().nonnegative().optional(),
					limit: z.number().int().min(1).max(100).optional(),
				}),
				outputSchema: z.object({
					section: SECTION,
					page: PAGE,
					summary: z
						.object({
							plugins: z.number(),
							activePlugins: z.number(),
							artifacts: z.number(),
							unavailableArtifactKinds: z.array(ARTIFACT_KIND),
						})
						.optional(),
					configSchema: z.record(z.string(), z.unknown()).optional(),
					config: z.record(z.string(), z.unknown()).optional(),
					redactions: z.number().optional(),
					plugins: z
						.array(
							z.object({
								id: z.string(),
								origin: ORIGIN,
								active: z.boolean(),
								source: z.enum(['preset', 'config', 'flag']),
								path: z.string().optional(),
								prefix: z.string().optional(),
								options: z.record(z.string(), z.unknown()),
								optionsSchema: z
									.record(z.string(), z.unknown())
									.optional(),
								schemaStatus: z.enum([
									'available',
									'unavailable',
								]),
								configExample: z
									.record(z.string(), z.unknown())
									.optional(),
								capabilities: z.object({
									tools: z.number(),
									prompts: z.number(),
									resources: z.number(),
									knowledge: z.number(),
									skills: z.number(),
								}),
							}),
						)
						.optional(),
					artifacts: z
						.array(
							z.object({
								id: z.string(),
								kind: ARTIFACT_KIND,
								owner: z.object({
									id: z.string().nullable(),
									origin: z.union([
										ORIGIN,
										z.literal('unknown'),
									]),
								}),
							}),
						)
						.optional(),
				}),
			},
			async (args) =>
				toolJson(
					readConfigurationCenterSection(
						snapshot(),
						args.section ?? 'summary',
						args.cursor ?? 0,
						args.limit ?? 50,
					),
				),
		);
	},
});
