import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { IRemoteResponseMeta } from '@delendai/contracts/remote-provider';
import type { ZodType } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IGitLabHttpRequestOptions } from '../../../src/lib/client';
import { buildGitLabToolRegistrations } from '../../../src/lib/tools/shared';

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

type RequestShape = Pick<
	IGitLabHttpRequestOptions<unknown>,
	'path' | 'query' | 'parseAs'
>;

type SeenRequest = {
	path: string;
	query?: NonNullable<RequestShape['query']>;
};

const baseMeta = (): IRemoteResponseMeta => ({
	status: 200,
	requestId: 'req-123',
	durationMs: 5,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
});

const withPagination = (
	pagination: NonNullable<IRemoteResponseMeta['pagination']>,
): IRemoteResponseMeta => ({
	...baseMeta(),
	pagination,
});

const toSeenRequest = (request: RequestShape): SeenRequest => {
	const { path, query } = request;
	return query === undefined ? { path } : { path, query };
};

const expectDefined = <T>(value: T | undefined, message: string): T => {
	expect(value, message).toBeDefined();
	if (value === undefined) {
		throw new Error(message);
	}
	return value;
};

const parseToolJson = (result: unknown): Record<string, unknown> => {
	const text =
		(result as { content?: Array<{ text?: string }> }).content?.[0]?.text ??
		'{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const collectHandlers = async (
	resolver: (
		request: RequestShape,
	) => Promise<{ data: unknown; meta: IRemoteResponseMeta }>,
) => {
	const pluginTempDir = await mkdtemp(join(tmpdir(), 'gitlab-tools-'));
	const client = {
		request: vi.fn(resolver),
	};
	const regs = buildGitLabToolRegistrations({
		namespacePrefix: 'gitlab',
		context: {
			provider: 'gitlab',
			token: 'test-token',
			apiBaseUrl: 'https://gitlab.example/api/v4',
			webBaseUrl: 'https://gitlab.example',
			host: 'gitlab.example',
			project: {
				provider: 'gitlab',
				host: 'gitlab.example',
				projectPath: 'group/repo',
				displayName: 'group/repo',
				webUrl: 'https://gitlab.example/group/repo',
				apiUrl: 'https://gitlab.example/api/v4/projects/group%2Frepo',
			},
			timeoutMs: 15_000,
			maxRetries: 0,
			retryBaseDelayMs: 250,
			sources: {
				token: 'env:GITLAB_TOKEN',
				apiBaseUrl: 'default',
				webBaseUrl: 'default',
				project: ['plugin'],
			},
		},
		client: client as never,
		pluginTempDir,
	});
	const server = new FakeServer();
	for (const reg of regs) {
		await reg.register(server as never);
	}
	return { tools: server.tools, client, pluginTempDir };
};

const getTool = (
	tools: Record<string, ToolRegistration>,
	name: string,
): ToolRegistration => {
	return expectDefined(tools[name], `Missing tool registration: ${name}`);
};

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('gitlab read-only tools (f00411 S2)', () => {
	it('registers the full S2 read-only surface with input/output schemas', async () => {
		const { tools, pluginTempDir } = await collectHandlers(async () => ({
			data: {},
			meta: baseMeta(),
		}));
		tempDirs.push(pluginTempDir);

		expect(Object.keys(tools).sort()).toEqual([
			'gitlab_artifacts',
			'gitlab_commits',
			'gitlab_context',
			'gitlab_deployments',
			'gitlab_issues',
			'gitlab_jobs',
			'gitlab_merge_requests',
			'gitlab_pipelines',
			'gitlab_projects',
			'gitlab_refs',
			'gitlab_releases',
		]);

		for (const tool of Object.values(tools)) {
			expect(tool.meta.inputSchema).toBeDefined();
			expect(tool.meta.outputSchema).toBeDefined();
			expect(
				tool.meta.inputSchema?.safeParse({ unexpected: true }).success,
			).toBe(false);
		}
	});

	it('returns self-managed context without depending on plugin-git state', async () => {
		const pluginTempDir = await mkdtemp(join(tmpdir(), 'gitlab-tools-'));
		const client = {
			request: vi.fn(async () => ({ data: {}, meta: baseMeta() })),
		};
		const regs = buildGitLabToolRegistrations({
			namespacePrefix: 'gitlab',
			context: {
				provider: 'gitlab',
				token: 'test-token',
				apiBaseUrl: 'https://gitlab.self.example/api/v4',
				webBaseUrl: 'https://gitlab.self.example',
				host: 'gitlab.self.example',
				project: {
					provider: 'gitlab',
					host: 'gitlab.self.example',
					projectPath: 'group/platform',
					displayName: 'group/platform',
					webUrl: 'https://gitlab.self.example/group/platform',
					apiUrl: 'https://gitlab.self.example/api/v4/projects/group%2Fplatform',
				},
				timeoutMs: 15_000,
				maxRetries: 0,
				retryBaseDelayMs: 250,
				sources: {
					token: 'env:GITLAB_TOKEN',
					apiBaseUrl: 'plugin',
					webBaseUrl: 'plugin',
					project: ['plugin'],
				},
			},
			client: client as never,
			pluginTempDir,
		});
		const server = new FakeServer();
		for (const reg of regs) {
			await reg.register(server as never);
		}
		tempDirs.push(pluginTempDir);
		const contextTool = getTool(server.tools, 'gitlab_context');

		const output = parseToolJson(await contextTool.handler({}));
		expect(output).toEqual({
			provider: 'gitlab',
			host: 'gitlab.self.example',
			apiBaseUrl: 'https://gitlab.self.example/api/v4',
			webBaseUrl: 'https://gitlab.self.example',
			defaultProject: {
				provider: 'gitlab',
				host: 'gitlab.self.example',
				projectPath: 'group/platform',
				displayName: 'group/platform',
				webUrl: 'https://gitlab.self.example/group/platform',
				apiUrl: 'https://gitlab.self.example/api/v4/projects/group%2Fplatform',
			},
			sources: {
				token: 'env:GITLAB_TOKEN',
				apiBaseUrl: 'plugin',
				webBaseUrl: 'plugin',
				project: ['plugin'],
			},
		});
		expect(client.request).not.toHaveBeenCalled();
		expect(contextTool.meta.outputSchema?.safeParse(output).success).toBe(
			true,
		);
	});

	it('paginates issue comments explicitly and exposes nextPage', async () => {
		const seen: SeenRequest[] = [];
		const { tools, pluginTempDir } = await collectHandlers(
			async (request) => {
				seen.push(toSeenRequest(request));
				return {
					data: [
						{
							id: 9,
							body: 'note body',
							created_at: '2026-08-31T00:00:00Z',
							updated_at: '2026-08-31T00:01:00Z',
							system: false,
							author: {
								name: 'Ada',
								username: 'ada',
								web_url: 'https://gitlab.example/ada',
							},
						},
					],
					meta: withPagination({
						page: 2,
						perPage: 5,
						nextPage: '3',
						previousPage: '1',
						total: 20,
						totalPages: 4,
						hasMore: true,
					}),
				};
			},
		);
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_issues');
		const output = parseToolJson(
			await tool.handler({
				action: 'comments',
				iid: 7,
				page: 2,
				perPage: 5,
			}),
		);

		expect(seen).toEqual([
			{
				path: '/projects/group%2Frepo/issues/7/notes',
				query: { page: 2, per_page: 5 },
			},
		]);
		expect(output.nextPage).toBe('3');
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
	});

	it('paginates merge request discussions explicitly and exposes nextPage', async () => {
		const seen: SeenRequest[] = [];
		const { tools, pluginTempDir } = await collectHandlers(
			async (request) => {
				seen.push(toSeenRequest(request));
				return {
					data: [
						{
							id: 'd-1',
							individual_note: false,
							notes: [
								{
									id: 4,
									body: 'discussion note',
									created_at: '2026-08-31T00:00:00Z',
									updated_at: '2026-08-31T00:01:00Z',
									system: false,
									author: {
										name: 'Linus',
										username: 'linus',
										web_url: 'https://gitlab.example/linus',
									},
								},
							],
						},
					],
					meta: withPagination({
						page: 1,
						perPage: 10,
						nextPage: '2',
						previousPage: null,
						total: 11,
						totalPages: 2,
						hasMore: true,
					}),
				};
			},
		);
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_merge_requests');
		const output = parseToolJson(
			await tool.handler({
				action: 'discussions',
				iid: 11,
				page: 1,
				perPage: 10,
			}),
		);

		expect(seen).toEqual([
			{
				path: '/projects/group%2Frepo/merge_requests/11/discussions',
				query: { page: 1, per_page: 10 },
			},
		]);
		expect(output.nextPage).toBe('2');
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
	});

	it('uses the pipeline jobs endpoint when filtering jobs by pipeline', async () => {
		const seen: SeenRequest[] = [];
		const { tools, pluginTempDir } = await collectHandlers(
			async (request) => {
				seen.push(toSeenRequest(request));
				return {
					data: [
						{
							id: 12,
							name: 'test',
							stage: 'ci',
							status: 'failed',
							web_url:
								'https://gitlab.example/group/repo/-/jobs/12',
							artifacts: [],
						},
					],
					meta: withPagination({
						page: 1,
						perPage: 20,
						nextPage: null,
						previousPage: null,
						total: 1,
						totalPages: 1,
						hasMore: false,
					}),
				};
			},
		);
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_jobs');
		const output = parseToolJson(
			await tool.handler({
				action: 'list',
				pipelineId: 55,
				status: 'failed',
				page: 1,
				perPage: 20,
			}),
		);

		expect(seen).toEqual([
			{
				path: '/projects/group%2Frepo/pipelines/55/jobs',
				query: { status: 'failed', page: 1, per_page: 20 },
			},
		]);
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
	});

	it('bounds job logs by UTF-8 bytes and reports truncation', async () => {
		const { tools, pluginTempDir } = await collectHandlers(async () => ({
			data: 'ááááá\nrest',
			meta: baseMeta(),
		}));
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_jobs');
		const output = parseToolJson(
			await tool.handler({
				action: 'log',
				id: 99,
				maxBytes: 5,
				maxLines: 10,
			}),
		);

		const log = output.log as {
			text: string;
			truncated: boolean;
			reason: string | null;
		};
		expect(Buffer.byteLength(log.text, 'utf8')).toBeLessThanOrEqual(5);
		expect(log.truncated).toBe(true);
		expect(log.reason).toBe('byte-limit');
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
		expect(
			tool.meta.inputSchema?.safeParse({
				action: 'log',
				id: 99,
				maxBytes: 0,
			}).success,
		).toBe(false);
	});

	it('downloads artifacts into the plugin temp dir with sanitized bounded paths', async () => {
		const payload = Buffer.from('0123456789', 'utf8');
		const { tools, pluginTempDir } = await collectHandlers(async () => ({
			data: payload.buffer.slice(
				payload.byteOffset,
				payload.byteOffset + payload.byteLength,
			),
			meta: baseMeta(),
		}));
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_artifacts');
		const output = parseToolJson(
			await tool.handler({
				action: 'download',
				jobId: 77,
				filename: '../../secret.zip',
				maxBytes: 4,
			}),
		);

		const savedTo = output.savedTo as string;
		expect(savedTo.startsWith(join(pluginTempDir, 'artifacts'))).toBe(true);
		expect(savedTo.includes('..')).toBe(false);
		expect(output.truncated).toBe(true);
		expect(output.bytes).toBe(10);
		expect((await stat(savedTo)).size).toBe(4);
		expect(await readFile(savedTo, 'utf8')).toBe('0123');
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
		expect(
			tool.meta.inputSchema?.safeParse({
				action: 'download',
				jobId: 77,
				maxBytes: 0,
			}).success,
		).toBe(false);
	});

	it('returns variable metadata without revealing values', async () => {
		const { tools, pluginTempDir } = await collectHandlers(async () => ({
			data: [
				{
					key: 'DEPLOY_ENV',
					value: 'super-secret',
					environment_scope: '*',
					masked: true,
					protected: true,
					hidden: true,
					variable_type: 'env_var',
				},
			],
			meta: baseMeta(),
		}));
		tempDirs.push(pluginTempDir);

		const tool = getTool(tools, 'gitlab_projects');
		const output = parseToolJson(
			await tool.handler({
				action: 'variables',
				projectPath: 'group/repo',
			}),
		);

		const variable = expectDefined(
			(output.variables as Array<Record<string, unknown>>)[0],
			'Expected one variable',
		);
		expect(variable).toEqual({
			key: 'DEPLOY_ENV',
			environmentScope: '*',
			masked: true,
			protected: true,
			hidden: true,
			raw: null,
			variableType: 'env_var',
		});
		expect(variable.value).toBeUndefined();
		expect(tool.meta.outputSchema?.safeParse(output).success).toBe(true);
	});
});
