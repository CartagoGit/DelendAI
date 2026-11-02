import z from 'zod';

import { ROADMAP_DEFERRAL_POLICIES } from '../constants/read-model.constant';
import { ROADMAP_GATE_KINDS } from '../constants/roadmap.constant';

/**
 * What a project declares to have a roadmap. Everything is optional, and
 * a project that names no `file` gets no tool and no diagnostic: the
 * plugin's defaults are nobody's roadmap.
 */
export const roadmapOptionsSchema = z
	.object({
		/** The authority file, relative to the workspace. */
		file: z.string().min(1).optional(),
		/** The timeline file; beside the authority file when absent. */
		timeline: z.string().min(1).optional(),
		/** A JSON file whose `version` says what is published. */
		versionFile: z.string().min(1).optional(),
		promotion: z
			.object({
				blockingGates: z.array(z.enum(ROADMAP_GATE_KINDS)).optional(),
				deferralPolicy: z.enum(ROADMAP_DEFERRAL_POLICIES).optional(),
				/** A cron expression, or `on-ready`. */
				schedule: z.string().min(1).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();
