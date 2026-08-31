import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { buildGitHubToolRegistrations } from './lib/tools';
import { resolveGitHubProviderContext } from './lib/config';
import { createGitHubHttpClient } from './lib/client';

const RepositorySchema = z
	.object({
		owner: z.string().optional(),
		repository: z.string().optional(),
		displayName: z.string().optional(),
		webUrl: z.string().url().optional(),
		apiUrl: z.string().url().optional(),
	})
	.strict()
	.refine(
		(value) => value.owner !== undefined || value.repository !== undefined,
		{
			message: 'defaultRepository requires owner or repository',
		},
	);

const OptionsSchema = z
	.object({
		apiUrl: z.string().url().optional(),
		webUrl: z.string().url().optional(),
		defaultRepository: RepositorySchema.optional(),
		timeoutMs: z.number().int().positive().max(120000).optional(),
		maxRetries: z.number().int().min(0).max(5).optional(),
		retryBaseDelayMs: z.number().int().min(0).max(60000).optional(),
	})
	.strict();

export { createGitHubHttpClient } from './lib/client';
export { resolveGitHubProviderContext } from './lib/config';
export type { IGitHubPluginOptions } from './lib/config';

export default definePlugin({
	name: 'github',
	version: '0.1.0',
	describe:
		'GitHub read-only provider context and injectable HTTP client for future read tools. No dependency on plugin-git or a local checkout.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`github plugin rejected its options: ${parsed.error.message}`,
			);
		}

		return {
			tools: [],
			tools: buildGitHubToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				pluginCacheDir: ctx.pluginCacheDir,
				context: resolveGitHubProviderContext({
					env: process.env,
					...(parsed.data.apiUrl !== undefined
						? { options: { apiUrl: parsed.data.apiUrl } }
						: {}),
				}),
				client: createGitHubHttpClient(
					{
						context: resolveGitHubProviderContext({
							env: process.env,
							options: parsed.data,
						}),
					},
					{
						fetchFn: fetch as typeof fetch,
					},
				),
			}),
			knowledge: [
				{
					id: 'github-provider-context',
					title: 'GitHub provider context',
					body: [
						'# GitHub provider context',
						'',
						'This plugin exposes the configuration, HTTP client, and read-only GitHub resources; it does not require plugin-git or a local checkout.',
						'',
						'Environment: GITHUB_TOKEN, plus optional GITHUB_API_URL for GitHub Enterprise Server.',
						'Repository: pass a default repository as owner + repository when you want the plugin to have built-in context.',
						'Read tools: context, repositories, issues, pull requests, commits, checks, workflows, jobs, artifacts, releases, tags and deployments.',
						'',
						'The HTTP client is injectable and hermetic for tests.',
					].join('\n'),
				},
			],
		};
	},
});
