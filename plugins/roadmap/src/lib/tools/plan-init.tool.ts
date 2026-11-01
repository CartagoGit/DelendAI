import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolJson } from '@delendai/core/public';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { roadmapEntrySchema } from '../contracts/schemas/roadmap.schema';
import { bumpHintSchema, invalidArguments } from './shared/envelope.helper';
import { recordChange } from './shared/record-change.helper';

const INPUT = z
	.object({
		/** The target version the new horizon is aimed at. */
		version: z.string().min(1),
		bumpHint: bumpHintSchema.optional(),
		/** What the version promises; entries can also be added by hand later. */
		entries: z.array(roadmapEntrySchema).optional(),
		/** Why the horizon is opened; the timeline keeps it. */
		reason: z.string().min(1),
		actor: z.string().min(1).optional(),
	})
	.strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	file: z.string(),
	version: z.string(),
	entries: z.number(),
	/** Events appended to the timeline. */
	recorded: z.number(),
});

export const buildRoadmapPlanInitTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_plan_init',
	tags: ['roadmap', 'write'],
	effects: ['write'],
	writeRoot: 'caller-checkout',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_plan_init`,
			{
				description:
					'Open a target version in the roadmap file (creating the file on first use) with what it promises, and record it in the timeline. Refuses a version that already has a horizon. Writes the roadmap and timeline files only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const workspace = await options.workspace();
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const { version, bumpHint, reason } = parsed.data;
				const entries = parsed.data.entries ?? [];
				const changed = await recordChange(
					options,
					(roadmap) =>
						roadmap.horizons.some(
							(each) => each.version === version,
						)
							? {
									ok: false,
									reason: `the roadmap already has a horizon ${version}`,
								}
							: {
									ok: true,
									value: {
										...roadmap,
										horizons: [
											...roadmap.horizons,
											{
												version,
												...(bumpHint === undefined
													? {}
													: { bumpHint }),
												entries,
											},
										],
									},
								},
					reason,
					parsed.data.actor,
				);
				if (!changed.ok) {
					return toolError(
						changed.reason,
						'Nothing was written. Use roadmap_show to see what the file holds.',
						'plan-init-refused',
					);
				}
				return toolJson(
					OUTPUT.parse({
						ok: true,
						file: workspace.file,
						version,
						entries: entries.length,
						recorded: changed.value.recorded,
					}),
				);
			},
		);
	},
});
