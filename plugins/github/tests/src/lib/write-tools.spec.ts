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
});
