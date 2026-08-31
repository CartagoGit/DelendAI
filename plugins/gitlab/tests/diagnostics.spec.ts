import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IRemoteResponseMeta } from '@mcp-vertex/contracts/remote-provider';

import { buildGitLabToolRegistrations } from '../src/lib/tools';

type ToolHandler = (args: unknown) => Promise<unknown>;

type ToolRegistration = {
	handler: ToolHandler;
	meta: {
		inputSchema?: { safeParse: (value: unknown) => { success: boolean } };
		outputSchema?: { safeParse: (value: unknown) => { success: boolean } };
	};
};

type RequestShape = {
	readonly path: string;
	readonly query?: Readonly<Record<string, unknown>>;
	readonly parseAs?: 'json' | 'text';
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

const baseMeta = (): IRemoteResponseMeta => ({
	status: 200,
	requestId: 'req-123',
	durationMs: 2,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
});

const parseToolJson = (result: unknown): Record<string, unknown> => {
	const text =
		(result as { content?: Array<{ text?: string }> }).content?.[0]?.text ??
		'{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const createSuite = async (options: {
	readonly host: string;
	readonly apiBaseUrl: string;
	readonly webBaseUrl: string;
	readonly projectPath: string;
	readonly request: (request: RequestShape) => Promise<{
		data: unknown;
		meta: IRemoteResponseMeta;
	}>;
}) => {
	const seen: RequestShape[] = [];
	const regs = buildGitLabToolRegistrations({
		namespacePrefix: 'gitlab',
		context: {
			provider: 'gitlab',
			token: 'glpat-test-token',
			apiBaseUrl: options.apiBaseUrl,
			webBaseUrl: options.webBaseUrl,
			host: options.host,
			project: {
				provider: 'gitlab',
				host: options.host,
				projectPath: options.projectPath,
				displayName: options.projectPath,
				webUrl: `${options.webBaseUrl}/${options.projectPath}`,
				apiUrl: `${options.apiBaseUrl}/projects/${encodeURIComponent(options.projectPath).replace(/%2F/gu, '%2F')}`,
			},
			timeoutMs: 15_000,
			maxRetries: 0,
			retryBaseDelayMs: 250,
			sources: {
				token: 'env:GITLAB_TOKEN',
				apiBaseUrl:
					options.host === 'gitlab.com' ? 'default' : 'plugin',
				webBaseUrl:
					options.host === 'gitlab.com' ? 'default' : 'plugin',
				project: ['plugin'],
			},
		},
		client: {
			request: async (request: RequestShape) => {
				seen.push(request);
				return (await options.request(request)) as never;
			},
		} as never,
		pluginTempDir: '/tmp/gitlab-diagnostics-spec',
	});
	const server = new FakeServer();
	for (const reg of regs) {
		await reg.register(server as never);
	}
	return {
		seen,
		get(name: string) {
			const tool = server.tools[name];
			if (tool === undefined) throw new Error(`missing tool ${name}`);
			return tool;
		},
	};
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('gitlab remote diagnostics delivery gate', () => {
	for (const fixture of [
		{
			label: 'GitLab.com',
			host: 'gitlab.com',
			apiBaseUrl: 'https://gitlab.com/api/v4',
			webBaseUrl: 'https://gitlab.com',
			projectPath: 'CartagoGit/mcp-vertex',
		},
		{
			label: 'self-managed GitLab',
			host: 'gitlab.self.example',
			apiBaseUrl: 'https://gitlab.self.example/api/v4',
			webBaseUrl: 'https://gitlab.self.example',
			projectPath: 'platform/mcp-vertex',
		},
	] as const) {
		it(`keeps ${fixture.label} diagnostics schema-safe without plugin-git`, async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const suite = await createSuite({
				...fixture,
				request: async (request) => {
					if (request.path.endsWith('/pipelines')) {
						return {
							data: [
								{
									id: 44,
									status: 'failed',
									ref: 'main',
									sha: 'abc123',
									web_url: `${fixture.webBaseUrl}/${fixture.projectPath}/-/pipelines/44`,
									created_at: '2026-08-31T00:00:00Z',
									updated_at: '2026-08-31T00:05:00Z',
									artifacts: [],
								},
							],
							meta: baseMeta(),
						};
					}
					if (request.path.endsWith('/jobs/44/trace')) {
						return {
							data: 'fatal\ncontext\nextra',
							meta: baseMeta(),
						};
					}
					throw new Error(`unexpected request ${request.path}`);
				},
			});

			const contextOutput = parseToolJson(
				await suite.get('gitlab_context').handler({}),
			);
			expect(
				suite
					.get('gitlab_context')
					.meta.outputSchema?.safeParse(contextOutput).success,
			).toBe(true);
			expect(contextOutput).toMatchObject({
				provider: 'gitlab',
				host: fixture.host,
				apiBaseUrl: fixture.apiBaseUrl,
				webBaseUrl: fixture.webBaseUrl,
				defaultProject: { projectPath: fixture.projectPath },
			});
			expect(suite.seen).toHaveLength(0);

			const pipelinesOutput = parseToolJson(
				await suite
					.get('gitlab_pipelines')
					.handler({ action: 'list', perPage: 1 }),
			);
			expect(
				suite
					.get('gitlab_pipelines')
					.meta.outputSchema?.safeParse(pipelinesOutput).success,
			).toBe(true);
			expect(pipelinesOutput).toMatchObject({
				action: 'list',
				pipelines: [{ id: 44, status: 'failed' }],
			});

			const logOutput = parseToolJson(
				await suite.get('gitlab_jobs').handler({
					action: 'log',
					id: 44,
					maxLines: 2,
					maxBytes: 100,
				}),
			);
			expect(
				suite.get('gitlab_jobs').meta.outputSchema?.safeParse(logOutput)
					.success,
			).toBe(true);
			expect(logOutput).toMatchObject({
				action: 'log',
				log: {
					text: 'fatal\ncontext',
					truncated: true,
					reason: 'line-limit',
					lines: 3,
				},
			});
			expect(suite.seen.map((request) => request.path)).toEqual([
				`/projects/${encodeURIComponent(fixture.projectPath).replace(/%2F/gu, '%2F')}/pipelines`,
				`/projects/${encodeURIComponent(fixture.projectPath).replace(/%2F/gu, '%2F')}/jobs/44/trace`,
			]);
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	}
});
