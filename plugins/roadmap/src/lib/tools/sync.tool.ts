import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';

import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { toolError, toolJson } from '@delendai/core/public';

import { TIMELINE_EVENT_KINDS } from '../contracts/constants/timeline.constant';
import {
	pendingTimelineDrafts,
	syncReport,
} from '../read-model/roadmap-sync.service';
import { roadmapUnreadable } from './shared/envelope.helper';

const INPUT = z.object({}).strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	inSync: z.boolean(),
	recorded: z.number(),
	pending: z.array(
		z.object({
			kind: z.enum(TIMELINE_EVENT_KINDS),
			horizon: z.string(),
			entryId: z.string().optional(),
		}),
	),
});

export const buildRoadmapSyncTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_sync',
	tags: ['roadmap', 'timeline', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_sync`,
			{
				description:
					'Whether the timeline tells the same story as the roadmap file, and which changes it has not recorded (a hand edit that no tool saw). Read-only: it reports, it records nothing.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async () => {
				const workspace = await options.workspace();
				const read = await workspace.roadmap.read();
				if (!read.ok) return roadmapUnreadable(read.reason);
				const events = await workspace.timeline.list();
				if (!events.ok) {
					return toolError(
						events.reason,
						'The timeline is derived: move the unreadable file aside and let the next write start a new one.',
						'timeline-unreadable',
					);
				}
				const drafts = pendingTimelineDrafts(read.value, events.value, {
					actor: 'roadmap_sync',
					at: (options.now ?? (() => new Date().toISOString()))(),
					reason: 'sync',
				});
				if (!drafts.ok) {
					return toolError(
						drafts.reason,
						'The recorded events do not replay; the roadmap file stays the authority.',
						'timeline-does-not-replay',
					);
				}
				return toolJson(
					OUTPUT.parse({
						ok: true,
						...syncReport(events.value.length, drafts.value),
					}),
				);
			},
		);
	},
});
