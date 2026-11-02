/**
 * catalogue-sources-schema.constant.ts — `catalogues` in delendai.config.json
 * or a person's own file: public catalogue sources read before the defaults.
 */
import { z } from 'zod';

const SOURCES = z
	.array(z.string().url())
	.describe('URLs read in order, before the default source.');

export const CATALOGUE_SOURCES_SCHEMA = z
	.object({
		agents: SOURCES.optional().describe(
			'Agent registries in the Agent Client Protocol registry format.',
		),
		models: SOURCES.optional().describe(
			'Model catalogues in the models.dev format.',
		),
	})
	.strict();
