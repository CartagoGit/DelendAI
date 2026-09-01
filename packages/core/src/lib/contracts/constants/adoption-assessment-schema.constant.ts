import z from 'zod';

const WriteEstimateBreakdownEntrySchema = z.object({
	kind: z.enum(['config', 'proposal-store', 'generated']),
	description: z.string(),
	count: z.number().optional(),
	exact: z.boolean(),
});

export const ADOPTION_ASSESSMENT_SCHEMA = z.object({
	recommendedPresetId: z.string(),
	recommendedPluginIds: z.array(z.string()),
	pluginRecommendations: z.array(
		z.object({
			id: z.string(),
			recommended: z.boolean(),
			rationale: z.string(),
		}),
	),
	conflicts: z.array(
		z.object({
			kind: z.enum(['existing-surface', 'write-estimate']),
			summary: z.string(),
			severity: z.enum(['info', 'warning']),
			count: z.number().optional(),
			exact: z.boolean(),
			breakdown: z.array(WriteEstimateBreakdownEntrySchema).optional(),
		}),
	),
	cost: z.object({
		presetId: z.string(),
		schemaBytes: z.number(),
		estimatedTokens: z.number(),
		recommendedPluginCount: z.number(),
		source: z.enum(['preset-budget', 'fallback-budget', 'plugin-budget']),
		runtimeSurface: z
			.enum(['managed', 'native', 'adaptive', 'compact'])
			.optional(),
		note: z.string(),
	}),
	summary: z.object({
		projectType: z.enum([
			'library',
			'cli',
			'webapp',
			'game',
			'monorepo',
			'generic',
		]),
		language: z.enum([
			'typescript',
			'javascript',
			'python',
			'go',
			'rust',
			'unknown',
		]),
		packageManager: z.enum(['bun', 'pnpm', 'yarn', 'npm', 'unknown']),
		ciProvider: z.enum([
			'github-actions',
			'gitlab-ci',
			'circleci',
			'unknown',
		]),
		docsConventions: z.array(z.string()),
	}),
});
