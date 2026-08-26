import { describe, expect, it } from 'vitest';
import z from 'zod';

import { createToolSurfaceRuntime } from '@mcp-vertex/core/lib/project/tool-surface-runtime.service';

const makeHandle = (enabled = true) => ({
	enabled,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

describe('tool-surface-runtime schema accounting', () => {
	it('measures registered MCP definitions, not compact catalog descriptors', () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: ['overview'],
			routerToolId: 'vertex',
			descriptors: [
				{
					registrationId: 'overview',
					name: 'mcp-vertex_overview',
					toolId: 'overview',
					summary: 'compact overview',
				},
				{
					registrationId: 'search_search',
					name: 'mcp-vertex_search_search',
					toolId: 'search',
					pluginId: 'search',
					namespace: 'search',
					summary: 'search source',
				},
			],
			plugins: [
				{
					id: 'search',
					namespace: 'search',
					toolRegistrationIds: ['search_search'],
				},
			],
		});
		const overviewHandle = makeHandle();
		const searchHandle = makeHandle();
		runtime.bindRegisteredTool({
			registrationId: 'overview',
			name: 'mcp-vertex_overview',
			description: 'Read the overview',
			inputSchema: z.object({ compact: z.boolean().optional() }),
			outputSchema: z.object({ ok: z.boolean() }),
			handler: async () => undefined,
			handle: overviewHandle,
		});
		runtime.bindRegisteredTool({
			registrationId: 'search_search',
			name: 'mcp-vertex_search_search',
			description: 'Search files',
			inputSchema: z.object({ query: z.string() }),
			handler: async () => undefined,
			handle: searchHandle,
		});

		const managed = runtime.measureSchemaBytes('managed');
		const native = runtime.measureSchemaBytes('native');

		expect(managed.overview).toBeGreaterThan(0);
		expect(managed.search_search).toBeUndefined();
		expect(native.overview).toBe(managed.overview);
		expect(native.search_search).toBeGreaterThan(0);
	});

	it('keeps a bounded routed working set and evicts it independently of visibility', () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: ['overview'],
			routerToolId: 'vertex',
			workingSet: { idleTtlMs: 100, maxWarmPlugins: 1 },
			descriptors: [
				{
					registrationId: 'alpha_run',
					name: 'mcp-vertex_alpha_run',
					toolId: 'run',
					pluginId: 'alpha',
					namespace: 'alpha',
				},
				{
					registrationId: 'beta_run',
					name: 'mcp-vertex_beta_run',
					toolId: 'run',
					pluginId: 'beta',
					namespace: 'beta',
				},
			],
			plugins: [
				{
					id: 'alpha',
					namespace: 'alpha',
					toolRegistrationIds: ['alpha_run'],
				},
				{
					id: 'beta',
					namespace: 'beta',
					toolRegistrationIds: ['beta_run'],
				},
			],
		});
		for (const [registrationId, name] of [
			['alpha_run', 'mcp-vertex_alpha_run'],
			['beta_run', 'mcp-vertex_beta_run'],
		] as const) {
			runtime.bindRegisteredTool({
				registrationId,
				name,
				handler: async () => undefined,
				handle: makeHandle(),
			});
		}

		const alpha = runtime.activatePlugin('alpha');
		const beta = runtime.activatePlugin('beta');
		expect(alpha?.active).toBe(true);
		expect(beta?.active).toBe(true);
		const context = runtime.getProjectContext({
			workspaceRoot: '/workspace',
		});
		expect(context.warmPlugins).toHaveLength(1);
		expect(context.loadedPlugins).toEqual(['alpha', 'beta']);
		expect(runtime.isToolExposed('mcp-vertex_alpha_run')).toBe(true);
		expect(runtime.evictIdlePlugins(Date.now() + 101)).toHaveLength(1);
		expect(
			runtime.getProjectContext({ workspaceRoot: '/workspace' })
				.warmPlugins,
		).toEqual([]);
	});
});
