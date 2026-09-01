import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildBootstrapToolRegistrations } from '@mcp-vertex/core/lib/bootstrap/bootstrap-tool';
import { buildPlanToolRegistration } from '@mcp-vertex/core/lib/bootstrap/plan-tool';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';

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

const callTool = async (
	tool: IToolRegistration,
	args: Record<string, unknown> = {},
) => {
	let handler:
		| ((value: Record<string, unknown>) => Promise<unknown>)
		| undefined;
	await tool.register({
		registerTool: (
			_name: string,
			_config: unknown,
			callback: typeof handler,
		) => {
			handler = callback;
		},
	} as unknown as McpServer);
	if (handler === undefined)
		throw new Error('tool handler was not registered');
	const response = (await handler(args)) as {
		readonly content: ReadonlyArray<{ readonly text?: string }>;
	};
	return JSON.parse(response.content[0]?.text ?? '{}') as Record<
		string,
		unknown
	>;
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

	it('x00101: compact summary is the DEFAULT; full:true opts in to the exhaustive payload', async () => {
		const invoke = await registerHandler({
			'package.json': JSON.stringify({
				name: 'consumer',
				scripts: { test: 'vitest' },
			}),
		});

		const bare = await invoke({});
		expect(bare).toHaveProperty('summary');
		expect(bare).not.toHaveProperty('blueprint');
		expect(bare).not.toHaveProperty('files');
		expect(Buffer.byteLength(JSON.stringify(bare), 'utf8')).toBeLessThan(
			2_000,
		);

		const full = await invoke({ full: true });
		expect(full).toHaveProperty('blueprint');
		expect(full).toHaveProperty('files');

		// Legacy escape hatch: compact:false behaves like full:true.
		const legacy = await invoke({ compact: false });
		expect(legacy).toHaveProperty('blueprint');
	});

	it('shares one analysis across analyze_project and plan_mcp_project in the same bootstrap session', async () => {
		let packageJsonReads = 0;
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider('/tmp/bootstrap-spec'),
			namespacePrefix: 'demo',
			reader: {
				readFile: async (path) => {
					if (path === 'package.json') packageJsonReads += 1;
					if (path !== 'package.json') return undefined;
					return JSON.stringify({
						name: 'consumer',
						scripts: { test: 'vitest' },
					});
				},
				exists: async (path) => path === 'package.json',
				listDir: async () => [],
			},
		});
		const analyze = tools.find((tool) => tool.id === 'analyze_project');
		const plan = tools.find((tool) => tool.id === 'plan_mcp_project');
		expect(analyze).toBeDefined();
		expect(plan).toBeDefined();

		await callTool(analyze!);
		await callTool(plan!);

		expect(packageJsonReads).toBe(1);
	});

	it('materialises exactly the full plan blueprint when create_project receives it back', async () => {
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider('/tmp/bootstrap-spec'),
			namespacePrefix: 'demo',
			reader: reader({
				'package.json': JSON.stringify({
					name: '@acme/service',
					scripts: { test: 'vitest', lint: 'eslint .' },
				}),
			}),
		});
		const plan = tools.find((tool) => tool.id === 'plan_mcp_project');
		const create = tools.find((tool) => tool.id === 'create_project');
		const fullPlan = await callTool(plan!, {
			full: true,
			targetDir: 'custom/mcp-project',
			adoption: { mode: 'replace' },
		});
		const blueprint = fullPlan.blueprint as Record<string, unknown>;
		const plannedFiles = fullPlan.files;
		const created = await callTool(create!, { blueprint });

		expect(created).toMatchObject({ kind: 'host' });
		expect(created.files).toEqual(plannedFiles);
		expect(
			(created.files as Array<{ path: string }>).some(
				({ path }) => path === 'custom/mcp-project/src/server.ts',
			),
		).toBe(true);
		expect(
			(created.files as Array<{ path: string }>).some(({ path }) =>
				path.endsWith('.tool.spec.ts'),
			),
		).toBe(true);
	});
});
