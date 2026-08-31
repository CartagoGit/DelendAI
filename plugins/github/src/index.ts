import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import {
	createGitHubHttpClient,
	createGitHubRemoteFetchFn,
} from './lib/client';
import { resolveGitHubProviderContext } from './lib/config';
import {
	buildGitHubToolRegistrations,
	buildGitHubWriteToolRegistrations,
} from './lib/tools';
import type {
	IGitHubPluginOptions,
	IGitHubProviderContext,
} from './lib/config';

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
		allowWrite: z.boolean().optional(),
	})
	.strict();

export { createGitHubHttpClient } from './lib/client';
export { resolveGitHubProviderContext } from './lib/config';
export { diagnoseGitHubWorkflow } from './lib/diagnostics';
export type { IGitHubPluginOptions } from './lib/config';
export type {
	IGitHubWorkflowDiagnosticInput,
	IGitHubWorkflowDiagnosticOptions,
} from './lib/diagnostics';

/**
 * The single knowledge entry the plugin contributes. It is emitted whether
 * or not a token resolved so a tokenless host still learns how to configure
 * one instead of seeing the plugin vanish without explanation.
 */
const buildGitHubKnowledgeEntry = (input: {
	readonly allowWrite: boolean;
	readonly configured: boolean;
}) => ({
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
		input.allowWrite
			? 'Write tools: issue update/comment, workflow dispatches, release create/update/delete, and tag create/delete. Every mutation requires confirm:true.'
			: 'Write tools are disabled by default. Opt in with {"plugins":{"github":{"options":{"allowWrite":true}}}}; every mutation still requires confirm:true.',
		...(input.configured
			? []
			: [
					'',
					'No token resolved from the environment, so NO tools are registered. Export GITHUB_TOKEN and restart the server to enable them.',
				]),
		'',
		'The HTTP client is injectable and hermetic for tests.',
	].join('\n'),
});

export default definePlugin({
	name: 'github',
	version: '0.1.0',
	describe:
		'GitHub provider context and injectable HTTP client for read tools plus opt-in mutable remote actions. No dependency on plugin-git or a local checkout.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`github plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const pluginOptions = {
			...(parsed.data.apiUrl !== undefined
				? { apiUrl: parsed.data.apiUrl }
				: {}),
			...(parsed.data.webUrl !== undefined
				? { webUrl: parsed.data.webUrl }
				: {}),
			...(parsed.data.defaultRepository !== undefined
				? {
						defaultRepository: {
							...(parsed.data.defaultRepository.owner !==
							undefined
								? { owner: parsed.data.defaultRepository.owner }
								: {}),
							...(parsed.data.defaultRepository.repository !==
							undefined
								? {
										repository:
											parsed.data.defaultRepository
												.repository,
									}
								: {}),
							...(parsed.data.defaultRepository.displayName !==
							undefined
								? {
										displayName:
											parsed.data.defaultRepository
												.displayName,
									}
								: {}),
							...(parsed.data.defaultRepository.webUrl !==
							undefined
								? {
										webUrl: parsed.data.defaultRepository
											.webUrl,
									}
								: {}),
							...(parsed.data.defaultRepository.apiUrl !==
							undefined
								? {
										apiUrl: parsed.data.defaultRepository
											.apiUrl,
									}
								: {}),
						},
					}
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
			...(parsed.data.allowWrite !== undefined
				? { allowWrite: parsed.data.allowWrite }
				: {}),
		} satisfies IGitHubPluginOptions;
		// A tokenless environment is normal, not a failure: the plugin ships
		// in the default presets, so a hard throw here turns every CI job,
		// budget measurement and contributor checkout without a
		// `GITHUB_TOKEN` into a plugin load error (and, downstream, a red
		// `tokens:gate`). Degrade to a tools-less registration that still
		// carries the knowledge entry explaining how to configure the token.
		const providerContext = ((): IGitHubProviderContext | null => {
			try {
				return resolveGitHubProviderContext({
					env: process.env,
					options: pluginOptions,
				});
			} catch {
				return null;
			}
		})();
		const allowWrite = parsed.data.allowWrite === true;
		if (providerContext === null) {
			return {
				tools: [],
				knowledge: [
					buildGitHubKnowledgeEntry({
						allowWrite,
						configured: false,
					}),
				],
			};
		}
		const fetchFn = createGitHubRemoteFetchFn(fetch);
		const client = createGitHubHttpClient(
			{ context: providerContext },
			{ fetchFn },
		);

		return {
			tools: buildGitHubToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				pluginCacheDir: ctx.pluginCacheDir,
				context: providerContext,
				client,
			}).concat(
				allowWrite
					? buildGitHubWriteToolRegistrations({
							namespacePrefix: ctx.namespacePrefix,
							context: providerContext,
							mutationDeps: {
								fetchFn,
							},
						})
					: [],
			),
			knowledge: [
				buildGitHubKnowledgeEntry({ allowWrite, configured: true }),
			],
		};
	},
});
