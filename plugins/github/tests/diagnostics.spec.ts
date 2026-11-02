import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildGitHubToolRegistrations } from '../src/lib/tools';
import type { IGitHubProviderContext } from '../src/lib/config';

type CapturedTool = {
	readonly name: string;
	readonly config: {
		readonly inputSchema: {
			safeParse: (value: unknown) => { success: boolean };
		};
		readonly outputSchema: {
			safeParse: (value: unknown) => { success: boolean };
		};
	};
	readonly handler: (args: unknown) => Promise<{
		readonly content: Array<{
			readonly type: 'text';
			readonly text: string;
		}>;
	}>;
};

type RequestShape = {
	readonly path: string;
	readonly query?: Readonly<Record<string, unknown>>;
	readonly parseAs?: 'json' | 'text';
};

const baseMeta = () => ({
	status: 200,
	requestId: 'req-1',
	durationMs: 2,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
});

const makeResult = (data: unknown) => ({
	ok: true as const,
	provider: 'github' as const,
	data,
	meta: baseMeta(),
});

const contextFixture = (
	kind: 'github.com' | 'enterprise',
): IGitHubProviderContext => {
	const host =
		kind === 'enterprise' ? 'github.enterprise.example' : 'github.com';
	const apiBaseUrl =
		kind === 'enterprise'
			? 'https://github.enterprise.example/api/v3'
			: 'https://api.github.com';
	const webBaseUrl =
		kind === 'enterprise'
			? 'https://github.enterprise.example'
			: 'https://github.com';
	return {
		provider: 'github',
		token: 'ghp-test-token',
		apiBaseUrl,
		webBaseUrl,
		host,
		repository: {
			provider: 'github',
			host,
			owner: 'CartagoGit',
			repository: 'delendai',
			webUrl: `${webBaseUrl}/CartagoGit/delendai`,
			apiUrl: `${apiBaseUrl}/repos/CartagoGit/delendai`,
		},
		timeoutMs: 15_000,
		maxRetries: 0,
		retryBaseDelayMs: 250,
		sources: {
			token: 'env:GITHUB_TOKEN',
			apiBaseUrl: kind === 'enterprise' ? 'plugin' : 'default',
			webBaseUrl: kind === 'enterprise' ? 'plugin' : 'default',
			repository: ['plugin'],
		},
	};
};

const createSuite = async (options: {
	readonly context: IGitHubProviderContext;
	readonly request: (request: RequestShape) => Promise<unknown>;
}) => {
	const calls: RequestShape[] = [];
	const tools = buildGitHubToolRegistrations({
		namespacePrefix: 'github',
		workspaceRootAbs: '/',
		context: options.context,
		client: {
			request: async (request: RequestShape) => {
				calls.push(request);
				return (await options.request(request)) as never;
			},
		},
	});
	const registered: CapturedTool[] = [];
	const server = {
		registerTool(
			name: string,
			config: CapturedTool['config'],
			handler: CapturedTool['handler'],
		) {
			registered.push({ name, config, handler });
		},
	};
	for (const tool of tools) {
		await tool.register(server as never);
	}
	return {
		calls,
		get(id: string) {
			const tool = registered.find(
				(entry) => entry.name === `github_${id}`,
			);
			if (tool === undefined) throw new Error(`missing tool ${id}`);
			return tool;
		},
	};
};

const parseOutput = async (
	tool: CapturedTool,
	args: unknown,
): Promise<Record<string, unknown>> => {
	const result = await tool.handler(args);
	return JSON.parse(result.content[0]?.text ?? '{}') as Record<
		string,
		unknown
	>;
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('github remote diagnostics delivery gate', () => {
	for (const fixture of ['github.com', 'enterprise'] as const) {
		it(`keeps ${fixture} workflow diagnostics schema-safe and independent from plugin-git`, async () => {
			const context = contextFixture(fixture);
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const suite = await createSuite({
				context,
				request: async (request) => {
					if (request.path.endsWith('/actions/runs')) {
						return makeResult({
							workflow_runs: [
								{
									id: 91,
									name: 'CI',
									workflow_id: 'ci.yml',
									head_branch: 'release/1.0',
									status: 'completed',
									conclusion: 'failure',
									html_url: `${context.webBaseUrl}/CartagoGit/delendai/actions/runs/91`,
									created_at: '2026-08-31T00:00:00Z',
									updated_at: '2026-08-31T00:05:00Z',
								},
							],
						});
					}
					if (request.path.endsWith('/actions/runs/91')) {
						return makeResult({
							id: 91,
							name: 'CI',
							workflow_id: 'ci.yml',
							head_branch: 'release/1.0',
							status: 'completed',
							conclusion: 'failure',
							html_url: `${context.webBaseUrl}/CartagoGit/delendai/actions/runs/91`,
							created_at: '2026-08-31T00:00:00Z',
							updated_at: '2026-08-31T00:05:00Z',
						});
					}
					if (request.path.endsWith('/actions/runs/91/jobs')) {
						return makeResult({
							jobs: [
								{
									id: 7,
									name: 'test',
									status: 'completed',
									conclusion: 'failure',
									html_url: `${context.webBaseUrl}/CartagoGit/delendai/actions/runs/91/job/7`,
									started_at: '2026-08-31T00:01:00Z',
									completed_at: '2026-08-31T00:04:00Z',
								},
							],
						});
					}
					throw new Error(`unexpected request ${request.path}`);
				},
			});

			const contextOutput = await parseOutput(suite.get('context'), {});
			expect(
				suite
					.get('context')
					.config.outputSchema.safeParse(contextOutput).success,
			).toBe(true);
			expect(contextOutput).toMatchObject({
				ok: true,
				data: {
					host: context.host,
					apiBaseUrl: context.apiBaseUrl,
					webBaseUrl: context.webBaseUrl,
					repository: {
						owner: 'CartagoGit',
						repository: 'delendai',
					},
				},
			});
			expect(suite.calls).toHaveLength(0);

			const runsOutput = await parseOutput(suite.get('workflows_runs'), {
				branch: 'release/1.0',
				perPage: 1,
			});
			expect(
				suite
					.get('workflows_runs')
					.config.outputSchema.safeParse(runsOutput).success,
			).toBe(true);
			expect(runsOutput).toMatchObject({
				ok: true,
				data: {
					runs: [
						{
							id: 91,
							url: `${context.webBaseUrl}/CartagoGit/delendai/actions/runs/91`,
						},
					],
				},
			});

			const workflowOutput = await parseOutput(
				suite.get('workflow_run'),
				{
					runId: 91,
				},
			);
			expect(
				suite
					.get('workflow_run')
					.config.outputSchema.safeParse(workflowOutput).success,
			).toBe(true);
			expect(workflowOutput).toMatchObject({
				ok: true,
				data: {
					run: {
						id: 91,
						jobs: [{ id: 7, name: 'test', conclusion: 'failure' }],
					},
				},
			});

			expect(suite.calls.map((request) => request.path)).toEqual([
				'/repos/CartagoGit/delendai/actions/runs',
				'/repos/CartagoGit/delendai/actions/runs/91',
				'/repos/CartagoGit/delendai/actions/runs/91/jobs',
			]);
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	}

	it('truncates enterprise job logs deterministically without using the real network', async () => {
		const context = contextFixture('enterprise');
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const suite = await createSuite({
			context,
			request: async (request) => {
				expect(request.parseAs).toBe('text');
				return makeResult('fatal line\ncontext line\nextra line');
			},
		});

		const output = await parseOutput(suite.get('jobs_logs'), {
			jobId: 321,
			maxLines: 2,
			maxBytes: 24,
		});

		expect(
			suite.get('jobs_logs').config.outputSchema.safeParse(output)
				.success,
		).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			data: {
				log: 'fatal line\ncontext line',
				truncation: {
					truncated: true,
					reason: 'line-limit',
					originalLines: 3,
					keptLines: 2,
				},
			},
		});
		expect(suite.calls).toEqual([
			{
				path: '/repos/CartagoGit/delendai/actions/jobs/321/logs',
				parseAs: 'text',
			},
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
