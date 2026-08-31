import { definePlugin } from '@mcp-vertex/core/public';
import { isAbsolute } from 'node:path';
import z from 'zod';

import { createGitLabHttpClient } from './lib/client';
import { buildGitLabToolRegistrations } from './lib/tools/shared';
import {
	resolveGitLabProviderContext,
	type IGitLabPluginOptions,
} from './lib/config';

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

const toRemoteFetchResponse = async (response: Response) => ({
	ok: response.ok,
	status: response.status,
	headers: {
		get(name: string): string | null {
			return response.headers.get(name);
		},
	},
	text: async () => response.text(),
	arrayBuffer: async () => response.arrayBuffer(),
});

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
		const pluginCacheDir = isAbsolute(ctx.pluginCacheDir)
			? ctx.pluginCacheDir
			: ctx.workspace.resolve(ctx.pluginCacheDir);
		const pluginOptions = {
			...(parsed.data.baseUrl !== undefined
				? { baseUrl: parsed.data.baseUrl }
				: {}),
			...(parsed.data.webUrl !== undefined
				? { webUrl: parsed.data.webUrl }
				: {}),
			...(parsed.data.defaultProject !== undefined
				? { defaultProject: parsed.data.defaultProject }
				: {}),
			...(parsed.data.timeoutMs !== undefined
				? { timeoutMs: parsed.data.timeoutMs }
				: {}),
			...(parsed.data.maxRetries !== undefined
				? { maxRetries: parsed.data.maxRetries }
				: {}),
			...(parsed.data.retryBaseDelayMs !== undefined
				? { retryBaseDelayMs: parsed.data.retryBaseDelayMs }
				: {}),
		} satisfies IGitLabPluginOptions;
		const providerContext = resolveGitLabProviderContext({
			env: process.env,
			options: pluginOptions,
		});
		const client = createGitLabHttpClient(
			{ context: providerContext },
			{
				fetchFn: async (url, init) =>
					toRemoteFetchResponse(await fetch(url, init)),
			},
		);

		return {
			tools: buildGitLabToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				context: providerContext,
				client,
				pluginTempDir: pluginCacheDir,
			}),
			knowledge: [
				{
					id: 'gitlab-provider-context',
					title: 'GitLab provider context and read tools',
					body: [
						'# GitLab provider context and read tools',
						'',
						'This slice exposes read-only GitLab resources without depending on plugin-git or a local checkout.',
						'',
						'Environment: GITLAB_TOKEN or the legacy GITLAB_PRIVATE_TOKEN, plus optional GITLAB_URL for self-managed instances.',
						'Project: pass a default project as projectId or projectPath when you want the plugin to have built-in context.',
						'Artifacts are downloaded only into the plugin temp dir and are capped by explicit byte limits.',
						'',
						'Each tool returns compact normalized output with explicit pagination metadata and no raw HTTP payloads.',
					].join('\n'),
				},
			],
		};
	},
});
