import { describe, expect, it } from 'vitest';

import { buildGitLabWriteToolRegistrations } from '../../../src/lib/tools';
import type { IGitLabProviderContext } from '../../../src/lib/config';

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
	}>;
};

type FetchCall = {
	readonly url: string;
	readonly init: {
		readonly method: string;
		readonly headers: Readonly<Record<string, string>>;
		readonly body?: string;
		readonly signal: AbortSignal;
	};
};

const baseContext = (
	overrides: Partial<IGitLabProviderContext> = {},
): IGitLabProviderContext => ({
	provider: 'gitlab',
	token: 'secret-token',
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
	...overrides,
});

const headersOf = (
	values: Readonly<Record<string, string>> = {},
): { get(name: string): string | null } => ({
	get(name: string) {
		const found = Object.entries(values).find(
			([key]) => key.toLowerCase() === name.toLowerCase(),
		);
		return found?.[1] ?? null;
	},
});

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
) => ({
	ok: status >= 200 && status < 300,
	status,
	headers: headersOf(headers),
	text: async () => body,
});

const createSuite = async (options: {
	readonly context?: Partial<IGitLabProviderContext>;
	readonly respond: (
		call: FetchCall,
		attempt: number,
	) => ReturnType<typeof response> | Promise<ReturnType<typeof response>>;
}) => {
	const calls: FetchCall[] = [];
	const attempts = new Map<string, number>();
	const tools = buildGitLabWriteToolRegistrations({
		namespacePrefix: 'gitlab',
		context: baseContext(options.context),
		mutationDeps: {
			fetchFn: async (url, init) => {
				const key = `${init.method} ${url}`;
				const attempt = (attempts.get(key) ?? 0) + 1;
				attempts.set(key, attempt);
				const call = {
					url,
					init: {
						method: init.method,
						headers: init.headers,
						...(init.body !== undefined ? { body: init.body } : {}),
						signal: init.signal,
					},
				};
				calls.push(call);
				return options.respond(call, attempt);
			},
		},
		nowIso: () => '2026-08-31T00:00:00.000Z',
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
	const get = (id: string): CapturedTool => {
		const found = registered.find((tool) => tool.name === `gitlab_${id}`);
		if (found === undefined) {
			throw new Error(`tool ${id} was not registered`);
		}
		return found;
	};
	return { calls, get, registered };
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

describe('@mcp-vertex/gitlab write tool registrations', () => {
	it('registers the full mutable GitLab surface with strict schemas', async () => {
		const suite = await createSuite({
			respond: async () => response(200, JSON.stringify({ ok: true })),
		});

		expect(suite.registered.map((tool) => tool.name).sort()).toEqual([
			'gitlab_discussion_write',
			'gitlab_issue_write',
			'gitlab_job_write',
			'gitlab_pipeline_write',
			'gitlab_release_write',
		]);

		for (const tool of suite.registered) {
			expect(tool.config.description).toContain('confirm:true');
			expect(tool.config.description).toContain('never auto-retries');
			expect(
				tool.config.inputSchema.safeParse({ unexpected: true }).success,
			).toBe(false);
			expect(tool.config.outputSchema).toBeDefined();
		}
	});

	it('rejects missing confirm before any HTTP request', async () => {
		const suite = await createSuite({
			respond: async () => response(200, JSON.stringify({ ok: true })),
		});
		const tool = suite.get('pipeline_write');

		expect(
			tool.config.inputSchema.safeParse({
				action: 'retry',
				id: 44,
				actor: 'copilot',
			}).success,
		).toBe(true);
		const output = await parseOutput(tool, {
			action: 'retry',
			id: 44,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(0);
		expect(output).toMatchObject({
			ok: false,
			outcome: 'rejected',
			error: { code: 'confirmation-required' },
			audit: {
				provider: 'gitlab',
				remote: { attempts: 0, duplicate: false, status: null },
			},
		});
	});

	it('returns normalized issue and pipeline outputs through the injected mutation deps', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				if (call.url.endsWith('/pipelines/44/retry')) {
					return response(
						200,
						JSON.stringify({
							id: 44,
							status: 'pending',
							source: 'push',
							ref: 'main',
							sha: 'abc123',
							web_url:
								'https://gitlab.example/group/repo/-/pipelines/44',
							created_at: '2026-08-31T12:00:00Z',
							updated_at: '2026-08-31T12:00:01Z',
							duration: 1,
							user: {
								name: 'Ada',
								username: 'ada',
								web_url: 'https://gitlab.example/ada',
							},
						}),
					);
				}
				expect(call.url).toBe(
					'https://gitlab.example/api/v4/projects/group%2Frepo/issues',
				);
				expect(call.init.method).toBe('POST');
				expect(call.init.body).toBe(
					JSON.stringify({
						title: 'Mutated issue',
						description: 'body',
					}),
				);
				return response(
					201,
					JSON.stringify({
						id: 101,
						iid: 5,
						title: 'Mutated issue',
						state: 'opened',
						web_url: 'https://gitlab.example/group/repo/-/issues/5',
						created_at: '2026-08-31T12:00:00Z',
						updated_at: '2026-08-31T12:00:01Z',
						description: 'body',
						labels: ['bug'],
						confidential: false,
						author: {
							name: 'Ada',
							username: 'ada',
							web_url: 'https://gitlab.example/ada',
						},
					}),
				);
			},
		});
		const issueTool = suite.get('issue_write');
		const pipelineTool = suite.get('pipeline_write');

		const issueOutput = await parseOutput(issueTool, {
			action: 'create',
			actor: 'copilot',
			confirm: true,
			title: 'Mutated issue',
			description: 'body',
		});
		const pipelineOutput = await parseOutput(pipelineTool, {
			action: 'retry',
			actor: 'copilot',
			confirm: true,
			id: 44,
		});

		expect(
			issueTool.config.outputSchema.safeParse(issueOutput).success,
		).toBe(true);
		expect(
			pipelineTool.config.outputSchema.safeParse(pipelineOutput).success,
		).toBe(true);
		expect(issueOutput.issue).toMatchObject({
			iid: 5,
			title: 'Mutated issue',
		});
		expect(pipelineOutput.pipeline).toMatchObject({
			id: 44,
			status: 'pending',
		});
	});

	it('returns provider failures without retrying and keeps redacted audit output schema-valid', async () => {
		const suite = await createSuite({
			respond: async (_call, attempt) => {
				expect(attempt).toBe(1);
				return response(
					403,
					JSON.stringify({ message: 'forbidden secret-token' }),
					{ 'x-request-id': 'req-forbidden' },
				);
			},
		});
		const tool = suite.get('release_write');

		const output = await parseOutput(tool, {
			action: 'tag',
			actor: 'copilot',
			confirm: true,
			tagName: 'v1.2.3',
			ref: 'main',
			message: 'contains secret-token',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(1);
		expect(output).toMatchObject({
			ok: false,
			outcome: 'failed',
			error: {
				code: 'forbidden',
				provider: 'gitlab',
			},
			audit: {
				provider: 'gitlab',
				remote: {
					attempts: 1,
					duplicate: false,
					requestId: 'req-forbidden',
					status: 403,
				},
			},
		});
		expect(JSON.stringify(output)).not.toContain('secret-token');
	});

	it('returns unauthorized and rate-limited failures as typed outputs without retrying', async () => {
		const scenarios = [
			{
				toolId: 'issue_write',
				args: {
					action: 'comment',
					actor: 'copilot',
					confirm: true,
					iid: 5,
					body: 'ship it',
				},
				status: 401,
				body: JSON.stringify({ message: 'unauthorized secret-token' }),
				headers: { 'x-request-id': 'req-401' },
				expected: {
					code: 'unauthorized',
					status: 401,
					retryAfterSeconds: null,
					requestId: 'req-401',
				},
			},
			{
				toolId: 'pipeline_write',
				args: {
					action: 'retry',
					actor: 'copilot',
					confirm: true,
					id: 44,
				},
				status: 429,
				body: JSON.stringify({ message: 'rate limited secret-token' }),
				headers: {
					'x-request-id': 'req-429',
					'retry-after': '60',
				},
				expected: {
					code: 'rate-limited',
					status: 429,
					retryAfterSeconds: 60,
					requestId: 'req-429',
				},
			},
		] as const;

		for (const scenario of scenarios) {
			const suite = await createSuite({
				respond: async (_call, attempt) => {
					expect(attempt).toBe(1);
					return response(
						scenario.status,
						scenario.body,
						scenario.headers,
					);
				},
			});
			const tool = suite.get(scenario.toolId);
			const output = await parseOutput(tool, scenario.args);

			expect(tool.config.outputSchema.safeParse(output).success).toBe(
				true,
			);
			expect(suite.calls).toHaveLength(1);
			expect(output).toMatchObject({
				ok: false,
				outcome: 'failed',
				error: {
					code: scenario.expected.code,
					status: scenario.expected.status,
					retryAfterSeconds: scenario.expected.retryAfterSeconds,
					requestId: scenario.expected.requestId,
					retryable: false,
				},
				audit: {
					remote: {
						attempts: 1,
						duplicate: false,
						status: scenario.expected.status,
						requestId: scenario.expected.requestId,
					},
				},
			});
			expect(JSON.stringify(output)).not.toContain('secret-token');
		}
	});
});
