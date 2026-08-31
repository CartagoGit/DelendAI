import { describe, expect, it } from 'vitest';

import { GitHubRequestError } from '../../../src/lib/client';
import { buildGitHubToolRegistrations } from '../../../src/lib/tools';
import type { IGitHubProviderContext } from '../../../src/lib/config';

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

const context = (
	overrides: Partial<IGitHubProviderContext> = {},
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'ghs_security_secret_456',
	apiBaseUrl: 'https://ghe.example/api/v3',
	webBaseUrl: 'https://ghe.example',
	host: 'ghe.example',
	repository: {
		provider: 'github',
		host: 'ghe.example',
		owner: 'CartagoGit',
		repository: 'mcp-vertex',
		webUrl: 'https://ghe.example/CartagoGit/mcp-vertex',
		apiUrl: 'https://ghe.example/api/v3/repos/CartagoGit/mcp-vertex',
	},
	timeoutMs: 15_000,
	maxRetries: 1,
	retryBaseDelayMs: 250,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'env',
		webBaseUrl: 'default',
		repository: ['plugin'],
	},
	...overrides,
});

const createSuite = async (
	request: (request: { path: string }) => Promise<any>,
) => {
	const tools = buildGitHubToolRegistrations({
		namespacePrefix: 'github',
		workspaceRootAbs: '/',
		context: context(),
		client: { request },
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
	return (id: string) => {
		const found = registered.find((tool) => tool.name === `github_${id}`);
		if (found === undefined) throw new Error(`missing tool ${id}`);
		return found;
	};
};

const parseOutput = async (tool: CapturedTool, args: unknown) => {
	const result = await tool.handler(args);
	return JSON.parse(result.content[0]?.text ?? '{}') as Record<
		string,
		unknown
	>;
};

describe('@mcp-vertex/github security', () => {
	it('keeps the context tool free of token values while still reporting sources', async () => {
		const get = await createSuite(async () => {
			throw new Error('network should not be used');
		});
		const tool = get('context');
		const output = await parseOutput(tool, { detail: 'full' });

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(JSON.stringify(output)).not.toContain('ghs_security_secret_456');
		expect(output).toMatchObject({
			ok: true,
			data: {
				host: 'ghe.example',
				sources: { token: 'env:GITHUB_TOKEN' },
				readOnly: true,
			},
		});
	});

	it('keeps failure envelopes free of token values even when upstream echoes them', async () => {
		const get = await createSuite(async () => {
			throw new GitHubRequestError({
				code: 'invalid-response',
				provider: 'github',
				message:
					'github request failed with token ghs_security_secret_456 in the proxy body',
				status: 500,
				requestId: 'req-redacted',
				retryAfterSeconds: null,
				temporary: false,
				retryable: false,
				details: {
					bodySample:
						'proxy echoed ghs_security_secret_456 in the body',
				},
			});
		});
		const tool = get('repositories_get');
		const output = await parseOutput(tool, {});

		expect(tool.config.outputSchema.safeParse(output).success).toBe(true);
		expect(output.ok).toBe(false);
		expect(output).toMatchObject({
			error: { code: 'invalid-response', requestId: 'req-redacted' },
		});
		expect(JSON.stringify(output)).not.toContain('ghs_security_secret_456');
		expect(JSON.stringify(output)).toContain('[REDACTED]');
	});
});
