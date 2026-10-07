import z from 'zod';
import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';

import plugin, {
	createGitLabHttpClient,
	resolveGitLabProviderContext,
} from '../../../src/index';

const baseCtx = (options: unknown = {}): IMcpPluginContext =>
	({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: { cacheDir: '.cache', docsDir: 'docs' },
		cacheDir: '.cache',
		docsDir: 'docs',
		keepLegacy: false,
		pluginCacheDir: '.cache/gitlab',
		pluginDocsDir: 'docs/gitlab',
		namespacePrefix: 'gitlab',
		env: {
			GITLAB_TOKEN: 'test-token',
		},
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

describe('@delendai/gitlab optionsSchema', async () => {
	it('exposes a strict optionsSchema', async () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({
				baseUrl: 'https://gitlab.example/api/v4',
				allowWrite: true,
				defaultProject: { projectPath: 'cartago/delendai' },
			}).success,
		).toBe(true);
		expect(
			plugin.optionsSchema?.safeParse({ unexpected: true }).success,
		).toBe(false);
	});

	it('registers cleanly and documents the provider context', async () => {
		const previousToken = process.env.GITLAB_TOKEN;
		const previousLegacyToken = process.env.GITLAB_PRIVATE_TOKEN;
		process.env.GITLAB_TOKEN = 'test-token';
		delete process.env.GITLAB_PRIVATE_TOKEN;
		try {
			const regs = await plugin.register(
				baseCtx({
					baseUrl: 'https://gitlab.example/api/v4',
					defaultProject: { projectPath: 'cartago/delendai' },
				}),
			);

			expect((regs.tools ?? []).length).toBeGreaterThan(0);
			expect(regs.knowledge?.[0]?.body).toContain('GITLAB_PRIVATE_TOKEN');
			expect(regs.knowledge?.[0]?.body).toContain('GITLAB_URL');
			expect(regs.knowledge?.[0]?.body).toContain('projectId');
		} finally {
			if (previousToken === undefined) delete process.env.GITLAB_TOKEN;
			else process.env.GITLAB_TOKEN = previousToken;
			if (previousLegacyToken === undefined)
				delete process.env.GITLAB_PRIVATE_TOKEN;
			else process.env.GITLAB_PRIVATE_TOKEN = previousLegacyToken;
		}
	});

	it('throws on invalid options before wiring context', async () => {
		expect(() =>
			plugin.register(baseCtx({ baseUrl: 'not-a-url' })),
		).toThrow(/rejected its options/);
	});

	it('adds separate write tools only when allowWrite is enabled', async () => {
		const previousToken = process.env.GITLAB_TOKEN;
		process.env.GITLAB_TOKEN = 'test-token';
		try {
			const readOnly = await plugin.register(baseCtx());
			const withWrite = await plugin.register(
				baseCtx({ allowWrite: true }),
			);

			expect((withWrite.tools ?? []).length).toBeGreaterThan(
				(readOnly.tools ?? []).length,
			);
			expect(
				(withWrite.tools ?? []).map((tool) => tool.id).sort(),
			).toEqual(
				expect.arrayContaining([
					'issue_write',
					'discussion_write',
					'pipeline_write',
					'job_write',
					'release_write',
				]),
			);
			expect(readOnly.knowledge?.[0]?.body).toContain('allowWrite');
			expect(withWrite.knowledge?.[0]?.body).toContain('confirm:true');
		} finally {
			if (previousToken === undefined) delete process.env.GITLAB_TOKEN;
			else process.env.GITLAB_TOKEN = previousToken;
		}
	});
});

describe('resolveGitLabProviderContext', () => {
	it('rejects missing tokens with an actionable message', () => {
		expect(() =>
			resolveGitLabProviderContext({
				env: {},
			}),
		).toThrow(/GITLAB_TOKEN.*GITLAB_PRIVATE_TOKEN/);
	});

	it('accepts the legacy token alias and the configured URL', () => {
		const context = resolveGitLabProviderContext({
			env: {
				GITLAB_PRIVATE_TOKEN: 'legacy-secret',
				GITLAB_URL: 'https://gitlab.example/api/v4',
			},
		});

		expect(context.token).toBe('legacy-secret');
		expect(context.apiBaseUrl).toBe('https://gitlab.example/api/v4');
		expect(context.webBaseUrl).toBe('https://gitlab.example');
	});

	it('lets plugin options override env configuration and project defaults', () => {
		const context = resolveGitLabProviderContext({
			env: {
				GITLAB_TOKEN: 'env-secret',
				GITLAB_URL: 'https://gitlab.example/api/v4',
				GITLAB_PROJECT_PATH: 'env/example',
			},
			options: {
				baseUrl: 'https://plugin.example/api/v4',
				defaultProject: { projectPath: 'plugin/example' },
			},
		});

		expect(context.apiBaseUrl).toBe('https://plugin.example/api/v4');
		expect(context.project?.projectPath).toBe('plugin/example');
		expect(context.sources.apiBaseUrl).toBe('plugin');
		expect(context.sources.project).toEqual(['env', 'plugin']);
	});
});

describe('createGitLabHttpClient', () => {
	it('uses injected fetch and preserves the GitLab API base URL', async () => {
		let seenUrl = '';
		let seenHeaders: Record<string, string> = {};
		const client = createGitLabHttpClient(
			{
				context: {
					provider: 'gitlab',
					token: 'secret-token',
					apiBaseUrl: 'https://gitlab.example/api/v4',
					webBaseUrl: 'https://gitlab.example',
					host: 'gitlab.example',
					project: null,
					timeoutMs: 15_000,
					maxRetries: 0,
					retryBaseDelayMs: 250,
					sources: {
						token: 'env:GITLAB_TOKEN',
						apiBaseUrl: 'default',
						webBaseUrl: 'default',
						project: [],
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
			path: '/projects/1',
			responseSchema: z.object({ ok: z.boolean() }).strict(),
		});

		expect(seenUrl).toBe('https://gitlab.example/api/v4/projects/1');
		expect(seenHeaders.authorization).toBe('Bearer secret-token');
		expect(result.meta.requestId).toBe('req-123');
		expect(result.data.ok).toBe(true);
	});
});
