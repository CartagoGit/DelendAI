import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

const ProjectSchema = z
	.object({
		projectId: z.union([z.string(), z.number()]).optional(),
		projectPath: z.string().optional(),
		displayName: z.string().optional(),
		webUrl: z.string().url().optional(),
		apiUrl: z.string().url().optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.projectId !== undefined || value.projectPath !== undefined,
		{
			message: 'defaultProject requires projectId or projectPath',
		},
	);

const OptionsSchema = z
	.object({
		baseUrl: z.string().url().optional(),
		webUrl: z.string().url().optional(),
		defaultProject: ProjectSchema.optional(),
		timeoutMs: z.number().int().positive().max(120000).optional(),
		maxRetries: z.number().int().min(0).max(5).optional(),
		retryBaseDelayMs: z.number().int().min(0).max(60000).optional(),
	})
	.strict();

export { createGitLabHttpClient } from './lib/client';
export { resolveGitLabProviderContext } from './lib/config';
export type { IGitLabPluginOptions } from './lib/config';

export default definePlugin({
	name: 'gitlab',
	version: '0.1.0',
	describe:
		'GitLab read-only provider context and injectable HTTP client for future read tools. No dependency on plugin-git or a local checkout.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`gitlab plugin rejected its options: ${parsed.error.message}`,
			);
		}

		return {
			tools: [],
			knowledge: [
				{
					id: 'gitlab-provider-context',
					title: 'GitLab provider context',
					body: [
						'# GitLab provider context',
						'',
						'This slice exposes the configuration and HTTP client seams for future read-only tools; it does not require plugin-git or a local checkout.',
						'',
						'Environment: GITLAB_TOKEN or the legacy GITLAB_PRIVATE_TOKEN, plus optional GITLAB_URL for self-managed instances.',
						'Project: pass a default project as projectId or projectPath when you want the plugin to have a built-in context.',
						'',
						'The HTTP client is injectable and hermetic for tests.',
					].join('\n'),
				},
			],
		};
	},
});
