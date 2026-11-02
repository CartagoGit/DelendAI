import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { toolJson } from '@delendai/core/public';

import { horizonDelta, isPublished } from '../read-model/roadmap-delta.service';
import { horizonReadiness } from '../read-model/roadmap-readiness.service';
import {
	bumpHintSchema,
	horizonsOf,
	invalidArguments,
	loadRoadmap,
	versionInputSchema,
} from './shared/envelope.helper';

/** The envelope the web page and the extension read: keep it stable. */
export const deltaOutputSchema = z.object({
	ok: z.literal(true),
	horizons: z.array(
		z.object({
			version: z.string(),
			declared: z.array(z.string()),
			delivered: z.array(z.string()),
			published: z.boolean().nullable(),
			bump: z.object({
				kind: z.string(),
				authority: z.string(),
				declared: bumpHintSchema.optional(),
				coherent: z.boolean(),
			}),
			nextAction: z.string(),
		}),
	),
});

export const buildRoadmapDeltaTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_delta',
	tags: ['roadmap', 'release', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_delta`,
			{
				description:
					'Per target version: what it still promises (`declared`), what of that is `delivered`, whether it is `published`, the bump its promises imply with the `authority` that decides the real one, and the one `nextAction`. Read-only.',
				inputSchema: versionInputSchema,
				outputSchema: deltaOutputSchema,
			},
			async (args) => {
				const workspace = await options.workspace();
				const parsed = versionInputSchema.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const loaded = await loadRoadmap(workspace);
				if (!loaded.ok) return loaded.error;
				const asked = horizonsOf(loaded.roadmap, parsed.data.version);
				if (!asked.ok) return asked.error;
				const current = await workspace.currentVersion();
				return toolJson(
					deltaOutputSchema.parse({
						ok: true,
						horizons: asked.horizons.map((horizon) =>
							horizonDelta(
								horizon,
								horizonReadiness(
									horizon,
									loaded.evidence,
									workspace.policy,
								),
								isPublished(horizon.version, current),
							),
						),
					}),
				);
			},
		);
	},
});
