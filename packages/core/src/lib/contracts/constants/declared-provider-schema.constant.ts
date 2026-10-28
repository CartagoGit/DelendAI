/**
 * declared-provider-schema.constant.ts — a model provider a project or a
 * person declares, in the shape models.dev gives its own entries (`name`,
 * `npm`, `api`, `env`, `models`). A declaration replaces the catalogue's
 * entry of the same id; a new id adds one.
 *
 * It lives under `modelProviders`, not `providers`: `providers` is the
 * orchestrator's roster of ways to run work, another shape.
 */
import z from 'zod';

const KEBAB_ID = /^[a-z0-9][a-z0-9-]*$/u;

export const DECLARED_PROVIDER_SCHEMA = z
	.object({
		id: z
			.string()
			.regex(KEBAB_ID)
			.describe('The provider id, as models.dev names it.'),
		name: z.string().min(1),
		npm: z
			.string()
			.min(1)
			.optional()
			.describe(
				'The SDK package that names its API family (@ai-sdk/openai-compatible…).',
			),
		api: z.string().url().optional().describe('Its API base URL.'),
		env: z
			.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u))
			.describe('The variables its key is read from, by name.'),
		models: z
			.union([
				z.array(z.string().min(1)),
				z.record(z.string(), z.unknown()),
			])
			.describe(
				"Its model ids: a list, or models.dev's map keyed by id.",
			),
		doc: z.string().url().optional(),
	})
	.strict();
