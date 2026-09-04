import z from 'zod';
import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';

import plugin, {
	createGitHubHttpClient,
	resolveGitHubProviderContext,
} from '../../../src/index';

const baseCtx = (options: unknown = {}): IMcpPluginContext =>
	({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: { cacheDir: '.cache', docsDir: 'docs' },
		cacheDir: '.cache',
		docsDir: 'docs',
		keepLegacy: false,
		pluginCacheDir: '.cache/github',
		pluginDocsDir: 'docs/github',
		namespacePrefix: 'github',
		options,
	}) as unknown as IMcpPluginContext;

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
): {
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
} => ({
	ok: status >= 200 && status < 300,
	status,
	headers: {
		get(name: string) {
			const found = Object.entries(headers).find(
				([key]) => key.toLowerCase() === name.toLowerCase(),
			);
			return found?.[1] ?? null;
		},
	},
	text: async () => body,
});

describe('@delendai/github optionsSchema', async () => {
	it('exposes a strict optionsSchema', async () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({
				apiUrl: 'https://api.github.example',
				allowWrite: true,
				defaultRepository: {
					owner: 'cartago',
					repository: 'mcp-vertex',
				},
			}).success,
		).toBe(true);
		expect(
			plugin.optionsSchema?.safeParse({ unexpected: true }).success,
		).toBe(false);
	});

	it('registers cleanly and documents the provider context', async () => {
		const previousToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'runtime-secret';
		try {
			const readOnlyRegs = await plugin.register(
				baseCtx({
					apiUrl: 'https://api.github.example',
					defaultRepository: {
						owner: 'cartago',
						repository: 'mcp-vertex',
					},
				}),
			);
			const writeRegs = await plugin.register(
				baseCtx({
					apiUrl: 'https://api.github.example',
					allowWrite: true,
					defaultRepository: {
						owner: 'cartago',
						repository: 'mcp-vertex',
					},
				}),
			);

			expect((readOnlyRegs.tools ?? []).map((tool) => tool.id)).toEqual([
				'context',
				'repositories_get',
				'repositories_search',
				'repositories_variables',
				'issues_list',
				'issues_show',
				'pull_requests_list',
				'pull_requests_show',
				'commits_list',
				'commits_show',
				'commit_statuses',
				'checks_runs',
				'workflows_list',
				'workflows_runs',
				'workflow_run',
				'jobs_list',
				'jobs_logs',
				'artifacts_list',
				'releases_list',
				'releases_show',
				'tags_list',
				'deployments_list',
				'deployment_statuses',
			]);
			expect((writeRegs.tools ?? []).map((tool) => tool.id)).toEqual([
				...(readOnlyRegs.tools ?? []).map((tool) => tool.id),
				'issue_update',
				'issue_comment_create',
				'workflow_dispatch',
				'repository_dispatch',
				'release_create',
				'release_update',
				'release_delete',
				'tag_create',
				'tag_delete',
			]);
			expect(readOnlyRegs.tools?.[0]?.summary).toBe(
				'GitHub provider context',
			);
			expect(readOnlyRegs.knowledge?.[0]?.body).toContain('GITHUB_TOKEN');
			expect(readOnlyRegs.knowledge?.[0]?.body).toContain(
				'GITHUB_API_URL',
			);
			expect(readOnlyRegs.knowledge?.[0]?.body).toContain(
				'owner + repository',
			);
			expect(readOnlyRegs.knowledge?.[0]?.body).toContain(
				'Write tools are disabled by default',
			);
			expect(writeRegs.knowledge?.[0]?.body).toContain(
				'Every mutation requires confirm:true',
			);
		} finally {
			if (previousToken === undefined) {
				delete process.env.GITHUB_TOKEN;
			} else {
				process.env.GITHUB_TOKEN = previousToken;
			}
		}
	});

	it('keeps mutable tool registration opt-in only', async () => {
		const previousToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'runtime-secret';
		try {
			const readOnlyRegs = await plugin.register(
				baseCtx({
					defaultRepository: {
						owner: 'cartago',
						repository: 'mcp-vertex',
					},
				}),
			);
			const writeRegs = await plugin.register(
				baseCtx({
					allowWrite: true,
					defaultRepository: {
						owner: 'cartago',
						repository: 'mcp-vertex',
					},
				}),
			);

			expect(
				(readOnlyRegs.tools ?? []).some(
					(tool) =>
						tool.id.includes('issue_') ||
						tool.id.includes('dispatch') ||
						tool.id.includes('release_') ||
						tool.id.includes('tag_'),
				),
			).toBe(false);
			expect(
				(writeRegs.tools ?? [])
					.filter((tool) => tool.effects?.includes('write'))
					.map((tool) => tool.id),
			).toEqual([
				'issue_update',
				'issue_comment_create',
				'workflow_dispatch',
				'repository_dispatch',
				'release_create',
				'release_update',
				'release_delete',
				'tag_create',
				'tag_delete',
			]);
		} finally {
			if (previousToken === undefined) {
				delete process.env.GITHUB_TOKEN;
			} else {
				process.env.GITHUB_TOKEN = previousToken;
			}
		}
	});

	it('throws on invalid options before wiring context', async () => {
		const previousToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'runtime-secret';
		try {
			expect(() =>
				plugin.register(baseCtx({ apiUrl: 'not-a-url' })),
			).toThrow(/rejected its options/);
		} finally {
			if (previousToken === undefined) {
				delete process.env.GITHUB_TOKEN;
			} else {
				process.env.GITHUB_TOKEN = previousToken;
			}
		}
	});
});

describe('resolveGitHubProviderContext', () => {
	it('rejects missing tokens with an actionable message', () => {
		expect(() =>
			resolveGitHubProviderContext({
				env: {},
			}),
		).toThrow(/GITHUB_TOKEN/);
	});

	it('uses GitHub.com defaults and derives the web URL from the API URL', () => {
		const context = resolveGitHubProviderContext({
			env: {
				GITHUB_TOKEN: 'secret',
			},
		});

		expect(context.token).toBe('secret');
		expect(context.apiBaseUrl).toBe('https://api.github.com');
		expect(context.webBaseUrl).toBe('https://github.com');
		expect(context.host).toBe('github.com');
		expect(context.repository).toBeNull();
	});

	it('accepts GitHub Enterprise configuration and explicit web URL', () => {
		const context = resolveGitHubProviderContext({
			env: {
				GITHUB_TOKEN: 'secret',
				GITHUB_API_URL: 'https://ghe.example/api/v3',
				GITHUB_OWNER: 'env-owner',
				GITHUB_REPOSITORY: 'env-repo',
			},
			options: {
				webUrl: 'https://ghe.example',
				defaultRepository: { repository: 'plugin-repo' },
			},
		});

		expect(context.apiBaseUrl).toBe('https://ghe.example/api/v3');
		expect(context.webBaseUrl).toBe('https://ghe.example');
		expect(context.repository?.owner).toBe('env-owner');
		expect(context.repository?.repository).toBe('plugin-repo');
		expect(context.sources.apiBaseUrl).toBe('env');
		expect(context.sources.webBaseUrl).toBe('plugin');
		expect(context.sources.repository).toEqual(['env', 'plugin']);
	});

	it('lets plugin options override env configuration and repository defaults', () => {
		const context = resolveGitHubProviderContext({
			env: {
				GITHUB_TOKEN: 'env-secret',
				GITHUB_API_URL: 'https://ghe.example/api/v3',
				GITHUB_OWNER: 'env-owner',
				GITHUB_REPOSITORY: 'env-repo',
			},
			options: {
				apiUrl: 'https://api.github.example',
				defaultRepository: {
					owner: 'plugin-owner',
					repository: 'plugin-repo',
				},
			},
		});

		expect(context.apiBaseUrl).toBe('https://api.github.example');
		expect(context.repository?.owner).toBe('plugin-owner');
		expect(context.repository?.repository).toBe('plugin-repo');
		expect(context.sources.apiBaseUrl).toBe('plugin');
		expect(context.sources.repository).toEqual(['env', 'plugin']);
	});
});

describe('createGitHubHttpClient', () => {
	it('uses injected fetch and preserves the GitHub API base URL', async () => {
		let seenUrl = '';
		let seenHeaders: Record<string, string> = {};
		const client = createGitHubHttpClient(
			{
				context: {
					provider: 'github',
					token: 'secret-token',
					apiBaseUrl: 'https://api.github.example',
					webBaseUrl: 'https://github.example',
					host: 'github.example',
					repository: null,
					timeoutMs: 15_000,
					maxRetries: 0,
					retryBaseDelayMs: 250,
					sources: {
						token: 'env:GITHUB_TOKEN',
						apiBaseUrl: 'default',
						webBaseUrl: 'default',
						repository: [],
					},
				},
			},
			{
				fetchFn: async (url, init) => {
					seenUrl = url;
					seenHeaders = init.headers as Record<string, string>;
					return response(200, JSON.stringify({ ok: true }), {
						'x-request-id': 'req-123',
					});
				},
			},
		);

		const result = await client.request({
			path: '/repos/cartago/mcp-vertex',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
		});

		expect(seenUrl).toBe(
			'https://api.github.example/repos/cartago/mcp-vertex',
		);
		expect(seenHeaders.authorization).toBe('Bearer secret-token');
		expect(result.meta.requestId).toBe('req-123');
		expect(result.data.ok).toBe(true);
	});
});
