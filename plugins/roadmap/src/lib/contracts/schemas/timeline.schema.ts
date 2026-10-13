import { z } from 'zod';

import {
	ROADMAP_BUMP_HINTS,
	ROADMAP_ENTRY_STATES,
} from '../constants/roadmap.constant';
import { TIMELINE_EVENT_KINDS } from '../constants/timeline.constant';
import { roadmapEntrySchema } from './roadmap.schema';

const nonEmpty = z.string().min(1);

export const timelineDraftSchema = z.strictObject({
	kind: z.enum(TIMELINE_EVENT_KINDS),
	actor: nonEmpty,
	at: z.iso.datetime(),
	reason: nonEmpty,
	horizon: nonEmpty,
	entryId: nonEmpty.optional(),
	entry: roadmapEntrySchema.optional(),
	from: z.enum(ROADMAP_ENTRY_STATES).optional(),
	to: z.enum(ROADMAP_ENTRY_STATES).optional(),
	bumpHint: z.enum(ROADMAP_BUMP_HINTS).optional(),
});

export const timelineEventSchema = timelineDraftSchema.extend({
	seq: z.number().int().positive(),
});
