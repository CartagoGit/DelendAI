import { z } from 'zod';

import {
	ROADMAP_BUMP_HINTS,
	ROADMAP_DATE_PATTERN,
	ROADMAP_ENTRY_KINDS,
	ROADMAP_ENTRY_STATES,
	ROADMAP_ESTIMATE_CONFIDENCES,
	ROADMAP_GATE_KINDS,
	ROADMAP_SCHEMA_VERSION,
} from '../constants/roadmap.constant';

const nonEmpty = z.string().min(1);

export const roadmapGateSchema = z.strictObject({
	kind: z.enum(ROADMAP_GATE_KINDS),
	target: nonEmpty.optional(),
	description: nonEmpty.optional(),
});

export const roadmapEstimateSchema = z.strictObject({
	date: z.string().regex(ROADMAP_DATE_PATTERN),
	basis: nonEmpty,
	confidence: z.enum(ROADMAP_ESTIMATE_CONFIDENCES),
});

export const roadmapEntrySchema = z.strictObject({
	id: nonEmpty,
	title: nonEmpty,
	kind: z.enum(ROADMAP_ENTRY_KINDS),
	state: z.enum(ROADMAP_ENTRY_STATES),
	gates: z.array(roadmapGateSchema),
	estimate: roadmapEstimateSchema.optional(),
	proposals: z.array(nonEmpty).optional(),
	supersededBy: nonEmpty.optional(),
	note: nonEmpty.optional(),
});

export const roadmapHorizonSchema = z.strictObject({
	version: nonEmpty,
	bumpHint: z.enum(ROADMAP_BUMP_HINTS).optional(),
	entries: z.array(roadmapEntrySchema),
});

/**
 * The shape of a roadmap whose version this package understands. The
 * version itself is checked before this schema runs, so an unknown future
 * version is reported as such rather than as a pile of field errors.
 */
export const roadmapSchema = z.strictObject({
	schemaVersion: z.literal(ROADMAP_SCHEMA_VERSION),
	horizons: z.array(roadmapHorizonSchema),
});
