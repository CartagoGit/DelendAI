import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildPlanToolRegistration } from '@mcp-vertex/core/lib/bootstrap/plan-tool';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (path) => files[path],
	exists: async (path) => path in files,
	listDir: async () => [],
});

const registerHandler = async (files: Record<string, string>) => {
	let handler:
		| ((args: Record<string, unknown>) => Promise<unknown>)
		| undefined;
	const server = {
		registerTool: (
			_name: string,
			_config: unknown,
			callback: (args: Record<string, unknown>) => Promise<unknown>,
		) => {
			handler = callback;
		},
	} as unknown as McpServer;
	await buildPlanToolRegistration({
		namespacePrefix: 'demo',
		reader: reader(files),
	}).register(server);
	if (handler === undefined)
		throw new Error('plan handler was not registered');
	return async (args: Record<string, unknown>) => {
		const response = (await handler?.(args)) as {
			readonly content: ReadonlyArray<{ readonly text?: string }>;
		};
		return JSON.parse(response.content[0]?.text ?? '{}') as Record<
			string,
			unknown
		>;
	};
};

describe('plan_mcp_project compact projection', () => {
	it('returns a bounded summary and paginates one lazy section', async () => {
		const invoke = await registerHandler({
			'package.json': JSON.stringify({
				name: '@acme/large-service',
				scripts: Object.fromEntries(
					Array.from({ length: 40 }, (_, index) => [
						`check:${index}`,
						`node check-${index}.js`,
					]),
				),
			}),
			'.vscode/mcp.json': '{}',
		});
		const summary = await invoke({
			compact: true,
			adoption: {
				mode: 'partial',
				selectedCapabilities: ['tools'],
			},
		});
		expect(Buffer.byteLength(JSON.stringify(summary), 'utf8')).toBeLessThan(
			2_000,
		);
		expect(summary).not.toHaveProperty('blueprint');
		expect(summary).not.toHaveProperty('files');
		expect(summary).not.toHaveProperty('detail');
		expect(summary).toMatchObject({
			summary: {
				counts: { prompts: 0, skills: 0, agents: 0 },
				adoptionStrategy: { mode: 'partial' },
			},
		});

		const page = await invoke({
			compact: true,
			section: 'tools',
			limit: 2,
			adoption: {
				mode: 'partial',
				selectedCapabilities: ['tools'],
			},
		});
		expect(page).toMatchObject({
			detail: { section: 'tools', cursor: 0, nextCursor: 2 },
		});
		expect(
			(page.detail as { readonly items: readonly unknown[] }).items,
		).toHaveLength(2);
	});

	it('does not emit host files when partial adoption preserves MCP config', async () => {
		const invoke = await registerHandler({
			'package.json': JSON.stringify({
				name: 'consumer',
				scripts: { test: 'vitest' },
			}),
			'.mcp.json': '{}',
		});
		const result = await invoke({
			compact: true,
			section: 'files',
			limit: 50,
			adoption: {
				mode: 'partial',
				selectedCapabilities: ['tools'],
			},
		});
		const paths = (
			result.detail as {
				readonly items: ReadonlyArray<{ readonly path: string }>;
			}
		).items.map(({ path }) => path);
		expect(paths.length).toBeGreaterThan(0);
		expect(paths).not.toContain('libs/mcp-project/src/server.ts');
		expect(paths.every((path) => path.includes('/tools/'))).toBe(true);
	});
});
