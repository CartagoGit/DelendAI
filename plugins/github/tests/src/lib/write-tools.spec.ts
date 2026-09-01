import { describe, expect, it } from 'vitest';

import { buildGitHubWriteToolRegistrations } from '../../../src/lib/tools';
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
	overrides: Partial<IGitHubProviderContext> = {},
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'secret-token',
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
	readonly context?: Partial<IGitHubProviderContext>;
	readonly respond: (
		call: FetchCall,
		attempt: number,
	) => ReturnType<typeof response> | Promise<ReturnType<typeof response>>;
}) => {
	const calls: FetchCall[] = [];
	const attempts = new Map<string, number>();
	const tools = buildGitHubWriteToolRegistrations({
		namespacePrefix: 'github',
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
		const found = registered.find((tool) => tool.name === `github_${id}`);
		if (found === undefined)
			throw new Error(`tool ${id} was not registered`);
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

describe('@mcp-vertex/github write tool registrations', () => {
	it('registers the full mutable tool surface with strict schemas', async () => {
		const suite = await createSuite({
			respond: async () => response(200, JSON.stringify({ ok: true })),
		});
		const cases = [
			{
				id: 'issue_update',
				input: { issue: 42, state: 'closed', confirm: true },
			},
			{
				id: 'issue_comment_create',
				input: { issue: 42, body: 'ship it', confirm: true },
			},
			{
				id: 'workflow_dispatch',
				input: { workflowId: 'ci.yml', ref: 'main', confirm: true },
			},
			{
				id: 'repository_dispatch',
				input: { eventType: 'release-cut', confirm: true },
			},
			{
				id: 'release_create',
				input: { tagName: 'v1.2.3', confirm: true },
			},
			{
				id: 'release_update',
				input: { releaseId: 7, name: 'v1.2.3', confirm: true },
			},
			{
				id: 'release_delete',
				input: { releaseId: 7, confirm: true },
			},
			{
				id: 'tag_create',
				input: { tagName: 'v1.2.3', sha: 'abc123', confirm: true },
			},
			{
				id: 'tag_delete',
				input: { tagName: 'v1.2.3', confirm: true },
			},
		] as const;

		expect(cases.map((item) => suite.get(item.id).name)).toEqual([
			'github_issue_update',
			'github_issue_comment_create',
			'github_workflow_dispatch',
			'github_repository_dispatch',
			'github_release_create',
			'github_release_update',
			'github_release_delete',
			'github_tag_create',
			'github_tag_delete',
		]);
		for (const testCase of cases) {
			const tool = suite.get(testCase.id);
			expect(
				tool.config.inputSchema.safeParse(testCase.input).success,
			).toBe(true);
			expect(
				tool.config.inputSchema.safeParse({
					...testCase.input,
					unexpected: true,
				}).success,
			).toBe(false);
		}
	});

	it('rejects missing confirm before any HTTP request', async () => {
		const suite = await createSuite({
			respond: async () => response(200, JSON.stringify({ ok: true })),
		});
		const tool = suite.get('issue_update');

		expect(
			tool.config.inputSchema.safeParse({ issue: 42, state: 'closed' })
				.success,
		).toBe(true);
		const output = await parseOutput(tool, {
			issue: 42,
			state: 'closed',
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(0);
		expect(output).toMatchObject({
			ok: false,
			outcome: 'rejected',
			error: { code: 'confirmation-required' },
			audit: {
				provider: 'github',
				remote: { attempts: 0, duplicate: false, status: null },
			},
		});
	});

	it('updates issues through the shared executor with audited fields', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/issues/42',
				);
				expect(call.init.method).toBe('PATCH');
				expect(call.init.body).toBe(
					JSON.stringify({
						title: 'Ship f00413',
						state: 'closed',
						labels: ['done'],
					}),
				);
				return response(
					200,
					JSON.stringify({
						number: 42,
						title: 'Ship f00413',
						state: 'closed',
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/issues/42',
						user: { login: 'copilot' },
						labels: [{ name: 'done' }],
						comments: 3,
					}),
					{ 'x-request-id': 'req-issue-update' },
				);
			},
		});
		const tool = suite.get('issue_update');

		const output = await parseOutput(tool, {
			issue: 42,
			title: 'Ship f00413',
			state: 'closed',
			labels: ['done'],
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				issue: {
					number: 42,
					title: 'Ship f00413',
					state: 'closed',
					labels: ['done'],
					commentsCount: 3,
				},
			},
			audit: {
				details: {
					fieldsChanged: 'title,state,labels',
					labelsCount: 1,
				},
				remote: { attempts: 1, duplicate: false, status: 200 },
			},
		});
	});

	it('creates issue comments through the shared executor', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/issues/42/comments',
				);
				expect(call.init.method).toBe('POST');
				expect(call.init.body).toBe(
					JSON.stringify({ body: 'queued for deploy' }),
				);
				return response(
					201,
					JSON.stringify({
						body: 'queued for deploy',
						created_at: '2026-08-31T00:00:10.000Z',
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/issues/42#issuecomment-1',
						user: { login: 'copilot' },
					}),
					{ 'x-request-id': 'req-issue-comment' },
				);
			},
		});
		const tool = suite.get('issue_comment_create');

		const output = await parseOutput(tool, {
			issue: 42,
			body: 'queued for deploy',
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				issueNumber: '42',
				comment: {
					author: 'copilot',
					body: 'queued for deploy',
				},
			},
			audit: {
				details: { bodyLength: 17 },
				remote: { attempts: 1, duplicate: false, status: 201 },
			},
		});
	});

	it('dispatches workflows through the shared executor with no-body success mapping', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/actions/workflows/deploy.yml/dispatches',
				);
				expect(call.init.method).toBe('POST');
				expect(call.init.body).toBe(
					JSON.stringify({
						ref: 'develop',
						inputs: { env: 'staging' },
					}),
				);
				return response(204, '', { 'x-request-id': 'req-dispatch' });
			},
		});
		const tool = suite.get('workflow_dispatch');

		const output = await parseOutput(tool, {
			workflowId: 'deploy.yml',
			ref: 'develop',
			inputs: { env: 'staging' },
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				workflowId: 'deploy.yml',
				ref: 'develop',
				dispatched: true,
				inputs: { env: 'staging' },
			},
			audit: {
				remote: { attempts: 1, duplicate: false, status: 204 },
			},
		});
	});

	it('dispatches repository events through the shared executor with schema-safe payload keys', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/dispatches',
				);
				expect(call.init.method).toBe('POST');
				expect(call.init.body).toBe(
					JSON.stringify({
						event_type: 'release-cut',
						client_payload: { channel: 'stable', dryRun: false },
					}),
				);
				return response(204, '', {
					'x-request-id': 'req-repository-dispatch',
				});
			},
		});
		const tool = suite.get('repository_dispatch');

		const output = await parseOutput(tool, {
			eventType: 'release-cut',
			clientPayload: { channel: 'stable', dryRun: false },
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				eventType: 'release-cut',
				dispatched: true,
				clientPayloadKeys: ['channel', 'dryRun'],
			},
			audit: {
				details: { payloadKeys: 'channel,dryRun' },
				remote: { attempts: 1, duplicate: false, status: 204 },
			},
		});
	});

	it('normalizes duplicate release creation without retrying and redacts token samples', async () => {
		const suite = await createSuite({
			respond: async (_call, attempt) => {
				expect(attempt).toBe(1);
				return response(
					422,
					JSON.stringify({
						message: 'Validation Failed secret-token',
						errors: [{ code: 'already_exists', field: 'tag_name' }],
					}),
					{ 'x-request-id': 'req-release-dup' },
				);
			},
		});
		const tool = suite.get('release_create');

		const output = await parseOutput(tool, {
			tagName: 'v1.2.3',
			name: 'v1.2.3',
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(1);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			duplicate: { message: 'release already exists remotely' },
			audit: {
				remote: { attempts: 1, duplicate: true, status: 422 },
			},
		});
		expect(JSON.stringify(output)).not.toContain('secret-token');
	});

	it('replays release creation with the default idempotency key as a typed duplicate', async () => {
		const suite = await createSuite({
			respond: async (_call, attempt) => {
				expect(attempt).toBe(1);
				return response(
					201,
					JSON.stringify({
						id: 77,
						tag_name: 'v1.2.3',
						name: 'v1.2.3',
						draft: false,
						prerelease: false,
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/releases/tag/v1.2.3',
					}),
					{ 'x-request-id': 'req-release-idempotent' },
				);
			},
		});
		const tool = suite.get('release_create');

		const args = {
			tagName: 'v1.2.3',
			name: 'v1.2.3',
			confirm: true,
			actor: 'copilot',
		};
		const first = await parseOutput(tool, args);
		const replay = await parseOutput(tool, args);

		expect(tool.config.outputSchema.safeParse(first).success).toBe(true);
		expect(tool.config.outputSchema.safeParse(replay).success).toBe(true);
		expect(suite.calls).toHaveLength(1);
		expect(first).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				release: {
					id: 77,
					tagName: 'v1.2.3',
					name: 'v1.2.3',
				},
			},
		});
		expect(replay).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			idempotentReplay: true,
			duplicate: {
				message:
					'idempotency key already completed this remote mutation',
				existing: {
					release: {
						id: 77,
						tagName: 'v1.2.3',
						name: 'v1.2.3',
					},
				},
			},
			audit: {
				idempotency: {
					key: 'release-create:CartagoGit/mcp-vertex:v1.2.3',
					replay: true,
				},
				remote: { attempts: 1, duplicate: true, status: 201 },
			},
		});
	});

	it('normalizes duplicate tag creation without retrying and redacts remote samples', async () => {
		const suite = await createSuite({
			respond: async (_call, attempt) => {
				expect(attempt).toBe(1);
				return response(
					422,
					JSON.stringify({
						message: 'Reference already exists for secret-token',
					}),
					{ 'x-request-id': 'req-tag-dup' },
				);
			},
		});
		const tool = suite.get('tag_create');

		const output = await parseOutput(tool, {
			tagName: 'v1.2.3',
			sha: 'abc123',
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(1);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			duplicate: { message: 'tag already exists remotely' },
			audit: {
				remote: {
					attempts: 1,
					duplicate: true,
					requestId: 'req-tag-dup',
					status: 422,
				},
			},
		});
		expect(JSON.stringify(output)).not.toContain('secret-token');
	});

	it('updates and deletes releases through the shared executor', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				if (call.init.method === 'PATCH') {
					expect(call.url).toBe(
						'https://api.github.com/repos/CartagoGit/mcp-vertex/releases/77',
					);
					expect(call.init.body).toBe(
						JSON.stringify({
							name: 'v1.2.4',
							body: 'notes',
							draft: false,
						}),
					);
					return response(
						200,
						JSON.stringify({
							id: 77,
							tag_name: 'v1.2.4',
							name: 'v1.2.4',
							draft: false,
							prerelease: false,
							html_url:
								'https://github.com/CartagoGit/mcp-vertex/releases/tag/v1.2.4',
						}),
						{ 'x-request-id': 'req-release-update' },
					);
				}
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/releases/77',
				);
				expect(call.init.method).toBe('DELETE');
				return response(204, '', {
					'x-request-id': 'req-release-delete',
				});
			},
		});
		const updateTool = suite.get('release_update');
		const deleteTool = suite.get('release_delete');

		const updated = await parseOutput(updateTool, {
			releaseId: 77,
			name: 'v1.2.4',
			body: 'notes',
			draft: false,
			confirm: true,
			actor: 'copilot',
		});
		const deleted = await parseOutput(deleteTool, {
			releaseId: 77,
			confirm: true,
			actor: 'copilot',
		});

		expect(updateTool.config.outputSchema.safeParse(updated).success).toBe(
			true,
		);
		expect(deleteTool.config.outputSchema.safeParse(deleted).success).toBe(
			true,
		);
		expect(updated).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				release: { id: 77, tagName: 'v1.2.4', name: 'v1.2.4' },
			},
			audit: {
				details: { releaseId: '77' },
				remote: { attempts: 1, duplicate: false, status: 200 },
			},
		});
		expect(deleted).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: { releaseId: '77', deleted: true },
			audit: {
				details: { releaseId: '77' },
				remote: { attempts: 1, duplicate: false, status: 204 },
			},
		});
	});

	it('returns forbidden failures for tag creation without retrying', async () => {
		const suite = await createSuite({
			respond: async (_call, attempt) => {
				expect(attempt).toBe(1);
				return response(403, JSON.stringify({ message: 'forbidden' }), {
					'x-request-id': 'req-tag-forbidden',
				});
			},
		});
		const tool = suite.get('tag_create');

		const output = await parseOutput(tool, {
			tagName: 'v1.2.3',
			sha: 'abc123',
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(suite.calls).toHaveLength(1);
		expect(output).toMatchObject({
			ok: false,
			outcome: 'failed',
			error: {
				code: 'forbidden',
				status: 403,
				retryable: false,
			},
			audit: {
				remote: { attempts: 1, duplicate: false, status: 403 },
			},
		});
	});

	it('returns unauthorized and rate-limited failures as typed results without retrying', async () => {
		const scenarios = [
			{
				toolId: 'issue_comment_create',
				args: {
					issue: 42,
					body: 'ship it',
					confirm: true,
					actor: 'copilot',
				},
				status: 401,
				body: JSON.stringify({
					message: 'bad credentials secret-token',
				}),
				headers: { 'x-request-id': 'req-401' },
				expected: {
					code: 'unauthorized',
					status: 401,
					retryAfterSeconds: null,
					requestId: 'req-401',
				},
			},
			{
				toolId: 'workflow_dispatch',
				args: {
					workflowId: 'deploy.yml',
					ref: 'main',
					confirm: true,
					actor: 'copilot',
				},
				status: 429,
				body: JSON.stringify({ message: 'rate limited secret-token' }),
				headers: {
					'x-request-id': 'req-429',
					'retry-after': '42',
				},
				expected: {
					code: 'rate-limited',
					status: 429,
					retryAfterSeconds: 42,
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

	it('deletes tags through the shared executor with schema-safe output', async () => {
		const suite = await createSuite({
			respond: async (call) => {
				expect(call.url).toBe(
					'https://api.github.com/repos/CartagoGit/mcp-vertex/git/refs/tags/v1.2.3',
				);
				expect(call.init.method).toBe('DELETE');
				return response(204, '', { 'x-request-id': 'req-tag-delete' });
			},
		});
		const tool = suite.get('tag_delete');

		const output = await parseOutput(tool, {
			tagName: 'v1.2.3',
			confirm: true,
			actor: 'copilot',
		});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: { tag: { name: 'v1.2.3', deleted: true } },
			audit: {
				details: { tagName: 'v1.2.3' },
				remote: { attempts: 1, duplicate: false, status: 204 },
			},
		});
	});
});
