import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

import gitPlugin from '@mcp-vertex/git';
import memoryPlugin from '@mcp-vertex/memory';

describe('e2e: dynamic and compact tool surfaces', async () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'tool-surface-'));
		execFileSync('git', ['init', '-q'], { cwd: workspace });
		execFileSync('git', ['config', 'user.email', 't@t.t'], {
			cwd: workspace,
		});
		execFileSync('git', ['config', 'user.name', 'T'], { cwd: workspace });
		writeFileSync(join(workspace, 'README.md'), '# surface\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: workspace });
	});

	afterEach(async () => {
		await close?.();
		rmSync(workspace, { recursive: true, force: true });
	});

	const connect = async (input: {
		argv: readonly string[];
		clientInfo?: Implementation;
		capabilities?: ClientCapabilities;
	}) => {
		const { argv, clientInfo, capabilities } = input;
		const args = parseCliArgs(argv, workspace);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				if (specifier.includes('mcp-memory')) {
					return { default: memoryPlugin };
				}
				if (specifier.includes('mcp-git')) {
					return { default: gitPlugin };
				}
				return { default: undefined };
			},
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			clientInfo ?? { name: 'tool-surface-test', version: '0.0.0' },
			{ capabilities: capabilities ?? {} },
		);
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	};

	const toolListChangedClientCaps: ClientCapabilities = {
		extensions: {
			'mcp-vertex/surface': {
				toolsListChanged: true,
			},
		},
	};

	it('negotiates adaptive from client capabilities, keeps bootstrap minimal, and emits list_changed', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: toolListChangedClientCaps,
		});
		const changed = new Promise<number>((resolve) => {
			let count = 0;
			client.setNotificationHandler(
				ToolListChangedNotificationSchema,
				() => {
					count += 1;
					resolve(count);
				},
			);
		});
		const initial = await client.listTools();
		const initialNames = initial.tools.map((tool) => tool.name);
		expect(initialNames).toContain('mcp-vertex_overview');
		expect(initialNames).toContain('mcp-vertex_plugin_activate');
		expect(initialNames).toContain('mcp-vertex_tool_search');
		expect(initialNames).toContain('mcp-vertex_status');
		expect(initialNames).toContain('mcp-vertex_vertex');
		expect(initialNames).not.toContain('mcp-vertex_project_context');
		expect(initialNames).not.toContain('mcp-vertex_configuration_center');
		expect(initialNames).not.toContain('mcp-vertex_memory_save');

		const adaptiveOverview = await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: {},
		});
		const overviewTools = (
			adaptiveOverview.structuredContent as {
				tools: Array<{ name: string }>;
			}
		).tools.map((tool) => tool.name);
		expect(overviewTools).not.toContain('mcp-vertex_memory_save');

		const activated = await client.callTool({
			name: 'mcp-vertex_plugin_activate',
			arguments: { plugin: 'memory' },
		});
		expect(
			(
				activated.structuredContent as {
					change: { pluginId: string; changedToolNames: string[] };
				}
			).change.pluginId,
		).toBe('memory');
		expect(await changed).toBeGreaterThan(0);

		const afterActivate = await client.listTools();
		const afterActivateNames = afterActivate.tools.map((tool) => tool.name);
		expect(afterActivateNames).toContain('mcp-vertex_memory_save');
		expect(afterActivateNames).toContain('mcp-vertex_memory_recall');

		const deactivated = await client.callTool({
			name: 'mcp-vertex_plugin_deactivate',
			arguments: { plugin: 'memory' },
		});
		expect(
			(
				deactivated.structuredContent as {
					change: { pluginId: string; active: boolean };
				}
			).change.active,
		).toBe(false);

		const afterDeactivate = await client.listTools();
		expect(afterDeactivate.tools.map((tool) => tool.name)).not.toContain(
			'mcp-vertex_memory_save',
		);
	});

	it('compact exposes the vertex router while keeping long tool docs in knowledge', async () => {
		await connect({
			argv: [
				'--surface=compact',
				'--plugins=git,memory',
				`--workspace=${workspace}`,
			],
		});
		const initial = await client.listTools();
		const names = initial.tools.map((tool) => tool.name);
		expect(names).toContain('mcp-vertex_vertex');
		expect(names).not.toContain('mcp-vertex_knowledge');
		expect(names).not.toContain('mcp-vertex_git_status');
		expect(names).not.toContain('mcp-vertex_memory_list');

		const searched = await client.callTool({
			name: 'mcp-vertex_tool_search',
			arguments: { plugin: 'memory' },
		});
		const toolSearchEntries = (
			searched.structuredContent as {
				entries: Array<{
					name: string;
					detailsId: string;
					active: boolean;
				}>;
			}
		).entries;
		const hiddenMemoryList = toolSearchEntries.find(
			(entry) => entry.name === 'mcp-vertex_memory_list',
		);
		expect(hiddenMemoryList?.active).toBe(false);

		expect(hiddenMemoryList?.detailsId).toContain('tool:');

		const routedMemory = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: { domain: 'memory', action: 'list', args: {} },
		});
		expect(
			(
				routedMemory.structuredContent as {
					tool: string;
					isError: boolean;
				}
			).tool,
		).toBe('mcp-vertex_memory_list');
		expect(
			(routedMemory.structuredContent as { isError: boolean }).isError,
		).toBe(false);

		const routedGit = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: { domain: 'git', action: 'status', args: {} },
		});
		expect(
			(
				routedGit.structuredContent as {
					tool: string;
					structuredContent?: unknown;
				}
			).tool,
		).toBe('mcp-vertex_git_status');
	});

	it('defaults an ordinary MCP client (no private capability) to adaptive, not native (r00026 / TOK-004)', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'plain-client', version: '1.0.0' },
			capabilities: {},
		});
		const initial = await client.listTools();
		const names = initial.tools.map((tool) => tool.name);
		// Bootstrap-only: memory's tools are not activated yet.
		expect(names).not.toContain('mcp-vertex_memory_save');
		expect(names).not.toContain('mcp-vertex_memory_recall');
		// The default is adaptive, so the bootstrap surface (including
		// the vertex router) is present even without the private
		// capability extension.
		expect(names).toContain('mcp-vertex_overview');
		expect(names).toContain('mcp-vertex_tool_search');
		expect(names).toContain('mcp-vertex_vertex');
	});

	it('a client that never refreshes tools/list can still reach an activated tool via the vertex router (r00026 / TOK-004)', async () => {
		// r00026: the class of risk TOK-004 flagged — a client that
		// receives (or ignores) notifications/tools/list_changed and
		// never re-calls tools/list. Proves adaptive-as-default does not
		// silently strand such a client: it can still discover and
		// invoke a just-activated tool through mcp-vertex_vertex without
		// ever refreshing its cached tool list.
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'never-refreshes', version: '1.0.0' },
			capabilities: {},
		});
		// Deliberately no `setNotificationHandler` registration and no
		// second `listTools()` call after this point — simulating a
		// client that ignores/never acts on list_changed.
		const initial = await client.listTools();
		expect(initial.tools.map((tool) => tool.name)).not.toContain(
			'mcp-vertex_memory_save',
		);

		await client.callTool({
			name: 'mcp-vertex_plugin_activate',
			arguments: { plugin: 'memory' },
		});

		const routed = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: {
				domain: 'memory',
				action: 'save',
				args: { title: 'never-refresh-check', body: 'reachable' },
			},
		});
		expect(
			(routed.structuredContent as { tool: string; isError: boolean })
				.tool,
		).toBe('mcp-vertex_memory_save');
		expect((routed.structuredContent as { isError: boolean }).isError).toBe(
			false,
		);
	});

	it('respects an explicit surface override over client capabilities', async () => {
		await connect({
			argv: [
				'--surface=native',
				'--plugins=memory',
				`--workspace=${workspace}`,
			],
			clientInfo: { name: 'cursor', version: '1.0.0' },
			capabilities: toolListChangedClientCaps,
		});
		const initial = await client.listTools();
		expect(initial.tools.map((tool) => tool.name)).toContain(
			'mcp-vertex_memory_save',
		);
	});
});
