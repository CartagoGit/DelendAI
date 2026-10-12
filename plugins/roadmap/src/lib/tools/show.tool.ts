import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { toolError, toolJson } from '@delendai/core/public';

import {
	entryDetail,
	summariseRoadmap,
} from '../read-model/roadmap-summary.service';
import {
	bumpHintSchema,
	entryKindSchema,
	entryStateSchema,
	horizonsOf,
	invalidArguments,
	loadRoadmap,
} from './shared/envelope.helper';

const INPUT = z
	.object({
		version: z.string().min(1).optional(),
		/** One entry whole: its gates, estimate and note. */
		entry: z.string().min(1).optional(),
	})
	.strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	file: z.string(),
	horizons: z.array(
		z.object({
			version: z.string(),
			bumpHint: bumpHintSchema.optional(),
			counts: z.object({
				total: z.number(),
				delivered: z.number(),
				withdrawn: z.number(),
				open: z.number(),
			}),
			entries: z.array(
				z.object({
					id: z.string(),
					title: z.string(),
					kind: entryKindSchema,
					state: entryStateSchema,
				}),
			),
		}),
	),
	entry: z
		.object({
			version: z.string(),
			entry: z.record(z.string(), z.unknown()),
		})
		.optional(),
});

export const buildRoadmapShowTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_show',
	tags: ['roadmap', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_show`,
			{
				description:
					'The roadmap as a compact listing: per target version its counts and one line per entry. Pass `entry` for one entry whole (gates, estimate, note). Read-only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const workspace = await options.workspace();
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const loaded = await loadRoadmap(workspace);
				if (!loaded.ok) return loaded.error;
				const asked = horizonsOf(loaded.roadmap, parsed.data.version);
				if (!asked.ok) return asked.error;
				const detail =
					parsed.data.entry === undefined
						? undefined
						: entryDetail(loaded.roadmap, parsed.data.entry);
				if (parsed.data.entry !== undefined && detail === undefined) {
					return toolError(
						`the roadmap has no entry ${parsed.data.entry}`,
						'Call without `entry` to list the ids there are.',
						'unknown-entry',
					);
				}
				return toolJson(
					OUTPUT.parse({
						ok: true,
						file: workspace.file,
						horizons: summariseRoadmap(
							loaded.roadmap,
							parsed.data.version,
						),
						...(detail === undefined ? {} : { entry: detail }),
					}),
				);
			},
		);
	},
});
