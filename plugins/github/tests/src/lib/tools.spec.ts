import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildGitHubToolRegistrations } from '../../../src/lib/tools';
import { GitHubRequestError } from '../../../src/lib/client';
import type { IGitHubProviderContext } from '../../../src/lib/config';

type CapturedTool = {
	readonly name: string;
	readonly config: {
		readonly description: string;
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
		readonly structuredContent?: Record<string, unknown>;
	}>;
};

type RequestShape = {
	readonly path: string;
	readonly query?: Readonly<Record<string, unknown>>;
	readonly parseAs?: 'json' | 'text';
};

const baseContext = (
	overrides: Partial<IGitHubProviderContext> = {},
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'secret',
	apiBaseUrl: 'https://api.github.com',
	webBaseUrl: 'https://github.com',
	host: 'github.com',
	repository: {
		provider: 'github',
		host: 'github.com',
		owner: 'CartagoGit',
		repository: 'mcp-vertex',
		webUrl: 'https://github.com/CartagoGit/mcp-vertex',
		apiUrl: 'https://api.github.com/repos/CartagoGit/mcp-vertex',
	},
	timeoutMs: 15000,
	maxRetries: 2,
	retryBaseDelayMs: 250,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		repository: ['plugin'],
	},
	...overrides,
});

const baseMeta = (
	overrides: Partial<{
		status: number;
		requestId: string | null;
		durationMs: number;
		attempts: number;
		pagination: {
			page: number | null;
			perPage: number | null;
			nextPage: string | null;
			previousPage: string | null;
			total: number | null;
			totalPages: number | null;
			hasMore: boolean;
		} | null;
		rateLimit: null;
		truncated: null;
	}> = {},
) => ({
	status: 200,
	requestId: 'req-1',
	durationMs: 3,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
	...overrides,
});

const makeResult = (data: unknown, meta = baseMeta()) => ({
	ok: true as const,
	provider: 'github' as const,
	data,
	meta,
});

const createSuite = async (options?: {
	readonly context?: Partial<IGitHubProviderContext>;
	readonly pluginCacheDir?: string;
	readonly request?: (request: RequestShape) => Promise<unknown>;
}) => {
	const calls: RequestShape[] = [];
	const toolOptions = {
		namespacePrefix: 'github',
		workspaceRootAbs: '/',
		context: baseContext(options?.context),
		client: {
			request: async (request: RequestShape) => {
				calls.push(request);
				if (options?.request === undefined) {
					throw new Error(`unexpected request ${request.path}`);
				}
				return (await options.request(request)) as never;
			},
		},
		...(options?.pluginCacheDir !== undefined
			? { pluginCacheDir: options.pluginCacheDir }
			: {}),
	};
	const tools = buildGitHubToolRegistrations(toolOptions);
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
	const get = (id: string): CapturedTool => {
		const found = registered.find((tool) => tool.name === `github_${id}`);
		if (found === undefined) {
			throw new Error(`tool ${id} was not registered`);
		}
		return found;
	};
	return { calls, get };
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

const parseOutputWithData = async (
	tool: CapturedTool,
	args: unknown,
): Promise<
	{ readonly data?: Record<string, unknown> } & Record<string, unknown>
> => {
	const result = await tool.handler(args);
	return JSON.parse(result.content[0]?.text ?? '{}') as {
		readonly data?: Record<string, unknown>;
	} & Record<string, unknown>;
};

describe('@mcp-vertex/github tool registrations', () => {
	it('validates the local context schema without HTTP meta', async () => {
		const suite = await createSuite();
		const tool = suite.get('context');

		expect(
			tool.config.inputSchema.safeParse({ detail: 'compact' }).success,
		).toBe(true);
		const output = await parseOutput(tool, { detail: 'compact' });
		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).not.toHaveProperty('meta');
	});

	it('returns invalid-config envelopes when owner/repository are unresolved', async () => {
		const suite = await createSuite({
			context: { repository: null },
			request: async () => {
				throw new Error('network should not be used');
			},
		});
		const tool = suite.get('repositories_get');

		const output = await parseOutput(tool, {});
		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output.ok).toBe(false);
		expect(output.error).toMatchObject({ code: 'invalid-config' });
		expect(suite.calls).toHaveLength(0);
	});

	it('keeps repository variables metadata-only and paginated', async () => {
		const suite = await createSuite({
			request: async (request) => {
				expect(request.path).toBe(
					'/repos/CartagoGit/mcp-vertex/actions/variables',
				);
				expect(request.query).toMatchObject({ page: 2, per_page: 5 });
				return makeResult(
					{
						variables: [
							{
								name: 'PUBLIC_FLAG',
								value: 'must-not-leak',
								visibility: 'all',
								created_at: '2026-08-31T00:00:00Z',
							},
						],
					},
					baseMeta({
						pagination: {
							page: 2,
							perPage: 5,
							nextPage: '3',
							previousPage: '1',
							total: 12,
							totalPages: 3,
							hasMore: true,
						},
					}),
				);
			},
		});
		const tool = suite.get('repositories_variables');

		const output = await parseOutput(tool, { page: 2, perPage: 5 });
		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output.data).toMatchObject({
			page: 2,
			perPage: 5,
			nextPage: '3',
		});
		expect(output.data).not.toMatchObject({
			variables: [{ value: 'must-not-leak' }],
		});
	});

	it('returns explicit pagination for checks, workflows and jobs', async () => {
		const suite = await createSuite({
			request: async (request) => {
				if (request.path.endsWith('/check-runs')) {
					return makeResult(
						{
							check_runs: [
								{ id: 10, name: 'ci', status: 'completed' },
							],
						},
						baseMeta({
							pagination: {
								page: 1,
								perPage: 10,
								nextPage: '2',
								previousPage: null,
								total: null,
								totalPages: null,
								hasMore: true,
							},
						}),
					);
				}
				if (request.path.endsWith('/actions/workflows')) {
					return makeResult(
						{
							workflows: [
								{
									id: 11,
									name: 'CI',
									path: '.github/workflows/ci.yml',
									state: 'active',
									html_url:
										'https://github.com/CartagoGit/mcp-vertex/actions/workflows/ci.yml',
								},
							],
						},
						baseMeta({
							pagination: {
								page: 3,
								perPage: 7,
								nextPage: null,
								previousPage: '2',
								total: 21,
								totalPages: 3,
								hasMore: false,
							},
						}),
					);
				}
				if (request.path.endsWith('/jobs')) {
					return makeResult(
						{
							jobs: [{ id: 99, name: 'lint', status: 'queued' }],
						},
						baseMeta({
							pagination: {
								page: 4,
								perPage: 25,
								nextPage: '5',
								previousPage: '3',
								total: 125,
								totalPages: 5,
								hasMore: true,
							},
						}),
					);
				}
				throw new Error(`unexpected request ${request.path}`);
			},
		});

		const checks = suite.get('checks_runs');
		const checksOutput = await parseOutput(checks, {
			ref: 'main',
			perPage: 10,
		});
		expect(checks.config.outputSchema.safeParse(checksOutput).success).toBe(
			true,
		);
		expect(checksOutput.data).toMatchObject({
			page: 1,
			perPage: 10,
			nextPage: '2',
		});

		const workflows = suite.get('workflows_list');
		const workflowsOutput = await parseOutput(workflows, {
			page: 3,
			perPage: 7,
		});
		expect(
			workflows.config.outputSchema.safeParse(workflowsOutput).success,
		).toBe(true);
		expect(workflowsOutput.data).toMatchObject({
			page: 3,
			perPage: 7,
			nextPage: null,
		});

		const jobs = suite.get('jobs_list');
		const jobsOutput = await parseOutput(jobs, {
			runId: 44,
			page: 4,
			perPage: 25,
		});
		expect(jobs.config.outputSchema.safeParse(jobsOutput).success).toBe(
			true,
		);
		expect(jobsOutput.data).toMatchObject({
			page: 4,
			perPage: 25,
			nextPage: '5',
		});
	});

	it('truncates job logs deterministically without network side effects', async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), 'github-tools-'));
		try {
			const suite = await createSuite({
				pluginCacheDir: tempRoot,
				request: async (request) => {
					expect(request.parseAs).toBe('text');
					return makeResult(
						'line-1\nline-2\nline-3\nline-4',
						baseMeta(),
					);
				},
			});
			const tool = suite.get('jobs_logs');

			const output = await parseOutput(tool, {
				jobId: 321,
				maxLines: 2,
				maxBytes: 20,
			});
			expect(tool.config.outputSchema.safeParse(output).success).toBe(
				true,
			);
			expect(output.data).toMatchObject({
				log: 'line-1\nline-2',
				truncation: {
					truncated: true,
					reason: 'line-limit',
					originalLines: 4,
					keptLines: 2,
				},
			});
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it('persists byte-truncated logs inside the plugin cache dir', async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), 'github-tools-'));
		try {
			const suite = await createSuite({
				pluginCacheDir: tempRoot,
				request: async () => makeResult('abcdefghij'),
			});
			const tool = suite.get('jobs_logs');

			const output = await parseOutputWithData(tool, {
				jobId: 555,
				maxBytes: 4,
				persist: true,
			});
			expect(tool.config.outputSchema.safeParse(output).success).toBe(
				true,
			);
			expect(output.data).toMatchObject({
				log: 'abcd',
				truncation: {
					truncated: true,
					reason: 'byte-limit',
					originalBytes: 10,
					keptBytes: 4,
				},
			});
			const persisted = String(output.data?.logPath ?? '');
			expect(persisted.startsWith(tempRoot)).toBe(true);
			const saved = await readFile(persisted, 'utf8');
			expect(saved).toContain('"truncated": true');
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it('lists large artifacts as metadata only and can persist a snapshot', async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), 'github-tools-'));
		try {
			const suite = await createSuite({
				pluginCacheDir: tempRoot,
				request: async (request) => {
					expect(request.path).toBe(
						'/repos/CartagoGit/mcp-vertex/actions/runs/77/artifacts',
					);
					return makeResult(
						{
							artifacts: [
								{
									id: 11,
									name: 'bundle.tar.zst',
									size_in_bytes: 9_000_000,
									expired: false,
									created_at: '2026-08-31T00:00:00Z',
									archive_download_url:
										'https://api.github.com/artifacts/11/zip',
								},
							],
						},
						baseMeta({
							pagination: {
								page: 1,
								perPage: 20,
								nextPage: null,
								previousPage: null,
								total: 1,
								totalPages: 1,
								hasMore: false,
							},
						}),
					);
				},
			});
			const tool = suite.get('artifacts_list');

			const output = await parseOutputWithData(tool, {
				runId: 77,
				persistSnapshot: true,
			});
			expect(
				tool.config.inputSchema.safeParse({ runId: 77 }).success,
			).toBe(true);
			expect(tool.config.outputSchema.safeParse(output).success).toBe(
				true,
			);
			expect(output.data).toMatchObject({
				page: 1,
				perPage: 20,
				nextPage: null,
				artifacts: [
					{
						id: 11,
						name: 'bundle.tar.zst',
						sizeInBytes: 9_000_000,
					},
				],
			});
			const snapshotPath = String(output.data?.snapshotPath ?? '');
			expect(snapshotPath.startsWith(tempRoot)).toBe(true);
			const snapshot = await readFile(snapshotPath, 'utf8');
			expect(snapshot).toContain('bundle.tar.zst');
			expect(suite.calls).toHaveLength(1);
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it('returns normalized error envelopes that still satisfy outputSchema', async () => {
		const suite = await createSuite({
			request: async () => {
				throw new GitHubRequestError({
					code: 'rate-limited',
					provider: 'github',
					message:
						'github request hit a rate limit for secret secret',
					status: 429,
					requestId: 'req-429',
					retryAfterSeconds: 60,
					temporary: true,
					retryable: false,
					details: { bodySample: 'secret token secret' },
				});
			},
		});
		const tool = suite.get('repositories_get');

		const output = await parseOutput(tool, {});
		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: false,
			error: {
				code: 'rate-limited',
				status: 429,
				retryAfterSeconds: 60,
			},
		});
		expect(JSON.stringify(output)).not.toContain('secret token secret');
	});
});
