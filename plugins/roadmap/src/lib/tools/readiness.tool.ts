import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { toolJson } from '@delendai/core/public';

import { ROADMAP_READINESS_STATUSES } from '../contracts/constants/read-model.constant';
import { horizonReadiness } from '../read-model/roadmap-readiness.service';
import {
	blockerSchema,
	horizonsOf,
	invalidArguments,
	loadRoadmap,
	versionInputSchema,
} from './shared/envelope.helper';

export const readinessSchema = z.object({
	version: z.string(),
	status: z.enum(ROADMAP_READINESS_STATUSES),
	reason: z.string(),
	blockers: z.array(blockerSchema),
	unverified: z.array(blockerSchema),
	toDefer: z.array(z.string()),
});

const OUTPUT = z.object({
	ok: z.literal(true),
	horizons: z.array(readinessSchema),
});

export const buildRoadmapReadinessTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_readiness',
	tags: ['roadmap', 'gates', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_readiness`,
			{
				description:
					'Whether each target version can be promoted: `ready`, `not-ready` (with the entries that hold it back) or `unknown` (nothing failed, a gate has no evidence). Dates never take part. Read-only.',
				inputSchema: versionInputSchema,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = versionInputSchema.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const loaded = await loadRoadmap(options.workspace());
				if (!loaded.ok) return loaded.error;
				const asked = horizonsOf(loaded.roadmap, parsed.data.version);
				if (!asked.ok) return asked.error;
				return toolJson(
					OUTPUT.parse({
						ok: true,
						horizons: asked.horizons.map((horizon) =>
							horizonReadiness(
								horizon,
								loaded.evidence,
								options.workspace().policy,
							),
						),
					}),
				);
			},
		);
	},
});
