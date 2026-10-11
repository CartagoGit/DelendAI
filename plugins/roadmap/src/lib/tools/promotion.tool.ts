import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolJson } from '@delendai/core/public';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { isPublished } from '../read-model/roadmap-delta.service';
import { horizonReadiness } from '../read-model/roadmap-readiness.service';
import {
	invalidArguments,
	loadRoadmap,
	versionInputSchema,
} from './shared/envelope.helper';
import { readinessSchema } from './readiness.tool';

const OUTPUT = z.object({
	ok: z.literal(true),
	/** The branch the work is integrated on, from the project's policy. */
	from: z.string(),
	/** The branch releases are cut from, from the project's policy. */
	to: z.string(),
	/** False when the project has one branch: there is nowhere to promote to. */
	promotable: z.boolean(),
	readiness: readinessSchema.optional(),
	nextAction: z.string(),
});

export const buildRoadmapPromotionTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_promotion',
	tags: ['roadmap', 'release', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_promotion`,
			{
				description:
					'Whether the conditions for promoting a target version from the integration branch to the release branch are met, and what holds it back. Informative only: it never merges, pushes or tags — the release gate decides. Without `version`, answers for the first version not yet published.',
				inputSchema: versionInputSchema,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = versionInputSchema.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const branches = options.branches;
				if (branches === undefined) {
					return toolError(
						'the project declares no development policy, so there are no branches to promote between',
						'Declare `development.branches` in the project configuration.',
						'no-branches',
					);
				}
				const base = {
					ok: true,
					from: branches.integration,
					to: branches.release,
				};
				if (branches.integration === branches.release) {
					return toolJson(
						OUTPUT.parse({
							...base,
							promotable: false,
							nextAction: `nothing: the project integrates and releases on ${branches.release}, so there is no promotion to make`,
						}),
					);
				}
				const loaded = await loadRoadmap(options.workspace());
				if (!loaded.ok) return loaded.error;
				const current = await options.workspace().currentVersion();
				const horizon =
					parsed.data.version === undefined
						? loaded.roadmap.horizons.find(
								(each) =>
									isPublished(each.version, current) !== true,
							)
						: loaded.roadmap.horizons.find(
								(each) => each.version === parsed.data.version,
							);
				if (horizon === undefined) {
					return parsed.data.version === undefined
						? toolJson(
								OUTPUT.parse({
									...base,
									promotable: true,
									nextAction:
										'nothing: every version the roadmap holds is published',
								}),
							)
						: toolError(
								`the roadmap has no horizon ${parsed.data.version}`,
								'Use roadmap_show to list the versions there are.',
								'unknown-version',
							);
				}
				const readiness = horizonReadiness(
					horizon,
					loaded.evidence,
					options.workspace().policy,
				);
				return toolJson(
					OUTPUT.parse({
						...base,
						promotable: true,
						readiness,
						nextAction:
							readiness.status === 'ready'
								? `open the pull request from ${branches.integration} into ${branches.release}: ${readiness.reason}`
								: `do not promote ${horizon.version} yet: ${readiness.reason}`,
					}),
				);
			},
		);
	},
});
