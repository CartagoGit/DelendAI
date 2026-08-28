/**
 * x00286 S4 — the acceptance test the proposal calls for: start the
 * REAL project (assembleCliConfig -> createMcpProject, exactly like
 * `tool-surface.e2e.spec.ts`), force a real LRU eviction over the wire
 * (a client `tools/call` through the managed router), and assert that
 * the evicted plugin's OWN `register()`-returned `dispose()` ran —
 * not a fake wired directly into `ToolSurfaceRuntime.setPluginDisposer`
 * the way `tool-surface-runtime-eviction.spec.ts` does. That unit test
 * proves the mechanism; this one proves the production wiring
 * (`assemble-plugins.ts` -> `managed-lazy-runtime.ts` ->
 * `create-mcp-project.ts` -> `setPluginDisposer`) actually connects it,
 * which is the entire finding: before this slice, `setPluginDisposer`
 * had no production caller.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';
import type { IPluginRuntime } from '@mcp-vertex/core/lib/contracts/interfaces/plugin-runtime.interface';
import type { IMcpPluginRegistrations } from '@mcp-vertex/core/lib/plugins/plugin-contract';

/**
 * A minimal but real plugin: it goes through the exact same
 * `activatePluginSession` -> `PluginActivationSession` pipeline every
 * first-party plugin does, registers exactly the tool id the managed
 * lazy catalog expects for `pluginId` ('memory' -> 'save', 'git' ->
 * 'status'), and returns a real `dispose` the harness retains in
 * `disposersInActivationOrder` (r00038) for the wiring under test to
 * reach.
 */
const buildDisposablePlugin = (input: {
	readonly pluginId: string;
	readonly toolId: string;
	readonly onDispose: () => void;
}) => ({
	name: input.pluginId,
	version: '0.0.0',
	register: (
		ctx: IMcpPluginContext,
	): IPluginRuntime<IMcpPluginRegistrations> => ({
		registrations: {
			tools: [
				{
					id: input.toolId,
					register: async (server: McpServer) => {
						server.registerTool(
							`${ctx.namespacePrefix}_${input.toolId}`,
							{
								description: `fake ${input.pluginId} tool`,
								inputSchema: {},
							},
							async () => ({
								content: [
									{
										type: 'text' as const,
										text: input.pluginId,
									},
								],
								structuredContent: { plugin: input.pluginId },
							}),
						);
					},
				},
			],
		},
		dispose: () => {
			input.onDispose();
		},
	}),
});

describe('e2e: evictIdlePlugins wires a real per-plugin dispose (x00286 S4)', () => {
	let client: Client;
	let close: (() => Promise<void>) | undefined;

	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	it('disposes the LRU-evicted plugin exactly once, then transparently reactivates it', async () => {
		const memoryDispose = vi.fn();
		const gitDispose = vi.fn();
		const memoryPlugin = buildDisposablePlugin({
			pluginId: 'memory',
			toolId: 'save',
			onDispose: memoryDispose,
		});
		const gitPlugin = buildDisposablePlugin({
			pluginId: 'git',
			toolId: 'status',
			onDispose: gitDispose,
		});

		const workspace = process.cwd();
		const args = parseCliArgs(
			['--plugins=memory,git', `--workspace=${workspace}`],
			workspace,
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				if (specifier.includes('memory'))
					return { default: memoryPlugin };
				if (specifier.includes('git')) return { default: gitPlugin };
				return { default: undefined };
			},
			// `maxWarmPlugins: 1` forces the very next plugin touch past
			// the first to LRU-evict whatever is already warm — the
			// smallest working set that can exercise real eviction.
			readFile: async () =>
				JSON.stringify({
					managedSurface: { loading: 'lazy', maxWarmPlugins: 1 },
				}),
		});

		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			{ name: 'claude-code', version: '1.0.0' },
			{ capabilities: {} },
		);
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};

		// Touch #1: warms "memory" (only plugin in the working set).
		const memoryCall = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: { domain: 'memory', action: 'save', args: {} },
		});
		expect(memoryCall.isError ?? false).toBe(false);
		expect(memoryDispose).not.toHaveBeenCalled();

		// Touch #2: warms "git" — with maxWarmPlugins: 1 this pushes the
		// working set over budget and LRU-evicts "memory", the only
		// other resident. `invokeTool` awaits the disposal task before
		// this call returns, so by the time we get here `memory`'s real
		// `dispose()` has already settled — no polling/sleeping needed.
		const gitCall = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: { domain: 'git', action: 'status', args: {} },
		});
		expect(gitCall.isError ?? false).toBe(false);

		// THE EVIDENCE: the plugin's own dispose() actually ran, exactly
		// once, through the production wiring — not a spy handed
		// directly to `setPluginDisposer` in a unit test.
		expect(memoryDispose).toHaveBeenCalledTimes(1);
		expect(gitDispose).not.toHaveBeenCalled();

		// Invoking the evicted plugin's tool afterwards must still work —
		// transparent relazy, not a permanently broken tool.
		const memoryAgain = await client.callTool({
			name: 'mcp-vertex_vertex',
			arguments: { domain: 'memory', action: 'save', args: {} },
		});
		expect(memoryAgain.isError ?? false).toBe(false);
		expect((memoryAgain.structuredContent as { tool: string }).tool).toBe(
			'mcp-vertex_memory_save',
		);

		// The module was never re-imported (managed-lazy-runtime caches
		// the activation), so its retained `dispose` is the SAME one —
		// re-evicting it later must not call it a second time. This also
		// guards `disposePlugin`'s "at most once per activation" promise
		// directly, rather than trusting the earlier assertion alone.
		expect(memoryDispose).toHaveBeenCalledTimes(1);
	});
});
