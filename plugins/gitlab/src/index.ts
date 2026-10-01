import { definePlugin } from '@delendai/core/public';
import { isAbsolute } from 'node:path';
import z from 'zod';

import { createGitLabHttpClient } from './lib/client';
import { buildGitLabToolRegistrations } from './lib/tools/shared';
import { buildGitLabWriteToolRegistrations } from './lib/tools/write-tools';
import {
	resolveGitLabProviderContext,
	type IGitLabPluginOptions,
	type IGitLabProviderContext,
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
		allowWrite: z.boolean().optional(),
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

const fetchFn = async (url: string, init: RequestInit) =>
	toRemoteFetchResponse(await fetch(url, init));

export { createGitLabHttpClient } from './lib/client';
export { diagnoseGitLabPipeline } from './lib/diagnostics';
export { resolveGitLabProviderContext } from './lib/config';
export { createGitLabMutationAdapter } from './lib/mutations';
export type { IGitLabPluginOptions } from './lib/config';
export type {
	IGitLabPipelineDiagnosticInput,
	IGitLabPipelineDiagnosticOptions,
} from './lib/diagnostics';

/**
 * The single knowledge entry the plugin contributes. It is emitted whether
 * or not a token resolved so a tokenless host still learns how to configure
 * one instead of seeing the plugin vanish without explanation.
 */
const buildGitLabKnowledgeEntry = (input: {
	readonly allowWrite: boolean;
	readonly configured: boolean;
}) => ({
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
		input.allowWrite
			? 'Write tools are enabled separately and require confirm:true for every mutation; they use the shared no-retry mutation executor and emit redacted audit receipts.'
			: 'Write tools stay disabled unless plugins.gitlab.options.allowWrite is set to true; read-only access never implies mutation access.',
		...(input.configured
			? []
			: [
					'',
					'No token resolved from the environment, so NO tools are registered. Export GITLAB_TOKEN and restart the server to enable them.',
				]),
		'',
		'The HTTP client and mutable executor wiring are injectable and hermetic for tests.',
	].join('\n'),
});

export default definePlugin({
	name: 'gitlab',
	version: '0.1.0',
	describe:
		'GitLab provider context and injectable HTTP client for read tools plus opt-in mutable remote actions. No dependency on plugin-git or a local checkout.',
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
				? {
						defaultProject: {
							...(parsed.data.defaultProject.projectId !==
							undefined
								? {
										projectId:
											parsed.data.defaultProject
												.projectId,
									}
								: {}),
							...(parsed.data.defaultProject.projectPath !==
							undefined
								? {
										projectPath:
											parsed.data.defaultProject
												.projectPath,
									}
								: {}),
							...(parsed.data.defaultProject.displayName !==
							undefined
								? {
										displayName:
											parsed.data.defaultProject
												.displayName,
									}
								: {}),
							...(parsed.data.defaultProject.webUrl !== undefined
								? {
										webUrl: parsed.data.defaultProject
											.webUrl,
									}
								: {}),
							...(parsed.data.defaultProject.apiUrl !== undefined
								? {
										apiUrl: parsed.data.defaultProject
											.apiUrl,
									}
								: {}),
						},
					}
				: {}),
			...(parsed.data.allowWrite !== undefined
				? { allowWrite: parsed.data.allowWrite }
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
		// A tokenless environment is normal, not a failure: the plugin ships
		// in the default presets, so a hard throw here turns every CI job,
		// budget measurement and contributor checkout without a
		// `GITLAB_TOKEN` into a plugin load error (and, downstream, a red
		// `tokens:gate`). Degrade to a tools-less registration that still
		// carries the knowledge entry explaining how to configure the token.
		const providerContext = ((): IGitLabProviderContext | null => {
			try {
				return resolveGitLabProviderContext({
					env: process.env,
					options: pluginOptions,
				});
			} catch {
				return null;
			}
		})();
		if (providerContext === null) {
			return {
				tools: [],
				knowledge: [
					buildGitLabKnowledgeEntry({
						allowWrite: parsed.data.allowWrite === true,
						configured: false,
					}),
				],
			};
		}
		const client = createGitLabHttpClient(
			{ context: providerContext },
			{
				fetchFn,
			},
		);
		const allowWrite = parsed.data.allowWrite === true;

		return {
			tools: [
				...buildGitLabToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					context: providerContext,
					client,
					pluginTempDir: pluginCacheDir,
				}),
				...(allowWrite
					? buildGitLabWriteToolRegistrations({
							namespacePrefix: ctx.namespacePrefix,
							context: providerContext,
							mutationDeps: { fetchFn },
						})
					: []),
			],
			knowledge: [
				buildGitLabKnowledgeEntry({ allowWrite, configured: true }),
			],
		};
	},
});
