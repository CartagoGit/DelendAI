import { describe, expect, it, vi } from 'vitest';

import plugin, { resolveGitLabProviderContext } from '../../../src/index';
import { GitLabRequestError } from '../../../src/lib/client';
import { buildGitLabToolRegistrations } from '../../../src/lib/tools/shared';

import type { IMcpPluginContext } from '@mcp-vertex/core/public';
import type { ZodType } from 'zod';

type ToolHandler = (args: unknown) => Promise<unknown>;

type ToolRegistration = {
	handler: ToolHandler;
	meta: {
		inputSchema?: ZodType<unknown>;
		outputSchema?: ZodType<unknown>;
	};
};

class FakeServer {
	tools: Record<string, ToolRegistration> = {};

	registerTool(
		name: string,
		meta: ToolRegistration['meta'],
		handler: ToolHandler,
	) {
		this.tools[name] = { handler, meta };
	}
}

const getTool = (
	tools: Record<string, ToolRegistration>,
	name: string,
): ToolRegistration => {
	const tool = tools[name];
	if (tool === undefined)
		throw new Error(`Missing tool registration: ${name}`);
	return tool;
};

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
			GITLAB_TOKEN: 'ultra-secret-token',
		},
		options,
	}) as unknown as IMcpPluginContext;

const parseToolJson = (result: unknown): Record<string, unknown> => {
	const text =
		(result as { content?: Array<{ text?: string }> }).content?.[0]?.text ??
		'{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const buildTools = async () => {
	const client = {
		request: vi.fn(async () => {
			throw new GitLabRequestError({
				code: 'unauthorized',
				provider: 'gitlab',
				message: 'gitlab request was rejected with 401',
				status: 401,
				requestId: 'req-401',
				retryAfterSeconds: null,
				temporary: false,
				retryable: false,
			});
		}),
	};
	const regs = buildGitLabToolRegistrations({
		namespacePrefix: 'gitlab',
		context: {
			provider: 'gitlab',
			token: 'ultra-secret-token',
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
		client: client as never,
		pluginTempDir: '/tmp/gitlab-security-tests',
	});
	const server = new FakeServer();
	for (const reg of regs) {
		await reg.register(server as never);
	}
	return server.tools;
};

describe('gitlab read-only security invariants (f00411 S3)', () => {
	it('rejects a missing token without echoing any secret value', () => {
		expect(() =>
			resolveGitLabProviderContext({
				env: {},
			}),
		).toThrow(/GITLAB_TOKEN.*GITLAB_PRIVATE_TOKEN/);
		expect(() =>
			resolveGitLabProviderContext({
				env: {},
			}),
		).not.toThrow(/ultra-secret-token/);
	});

	it('keeps the runtime token out of plugin knowledge and context outputs', async () => {
		const previousToken = process.env.GITLAB_TOKEN;
		const previousLegacyToken = process.env.GITLAB_PRIVATE_TOKEN;
		process.env.GITLAB_TOKEN = 'ultra-secret-token';
		delete process.env.GITLAB_PRIVATE_TOKEN;
		const regs = await plugin.register(
			baseCtx({
				baseUrl: 'https://gitlab.example/api/v4',
				defaultProject: { projectPath: 'group%2Frepo' },
			}),
		);
		if (previousToken === undefined) delete process.env.GITLAB_TOKEN;
		else process.env.GITLAB_TOKEN = previousToken;
		if (previousLegacyToken === undefined)
			delete process.env.GITLAB_PRIVATE_TOKEN;
		else process.env.GITLAB_PRIVATE_TOKEN = previousLegacyToken;

		const knowledge = regs.knowledge?.[0]?.body ?? '';
		expect(knowledge).toContain('GITLAB_TOKEN');
		expect(knowledge).not.toContain('ultra-secret-token');

		const tools = await buildTools();
		const contextTool = getTool(tools, 'gitlab_context');
		const contextOutput = parseToolJson(await contextTool.handler({}));
		const rendered = JSON.stringify(contextOutput);
		expect(contextOutput.sources).toEqual({
			token: 'env:GITLAB_TOKEN',
			apiBaseUrl: 'default',
			webBaseUrl: 'default',
			project: [],
		});
		expect(rendered).not.toContain('ultra-secret-token');
	});

	it('returns actionable tool errors without leaking authorization data', async () => {
		const tools = await buildTools();
		const projectsTool = getTool(tools, 'gitlab_projects');
		const result = parseToolJson(
			await projectsTool.handler({
				action: 'get',
				projectId: 1,
			}),
		);
		const rendered = JSON.stringify(result);

		expect(result).toEqual({
			ok: false,
			error: {
				reason: 'gitlab request was rejected with 401',
				nextAction:
					'Check the GitLab token and selected project permissions.',
			},
		});
		expect(rendered).not.toContain('ultra-secret-token');
		expect(rendered.toLowerCase()).not.toContain('authorization');
	});
});
