import { describe, expect, it } from 'vitest';
import z from 'zod';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import { ToolNotAuthorizedError } from '@delendai/core/lib/project/tool-surface-runtime.helper';

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
					name: 'delendai_overview',
					toolId: 'overview',
					summary: 'compact overview',
				},
				{
					registrationId: 'search_search',
					name: 'delendai_search_search',
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
			name: 'delendai_overview',
			description: 'Read the overview',
			inputSchema: z.object({ compact: z.boolean().optional() }),
			outputSchema: z.object({ ok: z.boolean() }),
			handler: async () => undefined,
			handle: overviewHandle,
		});
		runtime.bindRegisteredTool({
			registrationId: 'search_search',
			name: 'delendai_search_search',
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
					name: 'delendai_alpha_run',
					toolId: 'run',
					pluginId: 'alpha',
					namespace: 'alpha',
				},
				{
					registrationId: 'beta_run',
					name: 'delendai_beta_run',
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
			['alpha_run', 'delendai_alpha_run'],
			['beta_run', 'delendai_beta_run'],
		] as const) {
			// A `bindLazyTool` activator must be retained BEFORE the tool
			// materializes (x00286): eviction can only relaze a plugin it
			// knows how to reactivate, and `isPluginEvictable` refuses to
			// evict any plugin missing one — exactly the production shape,
			// where every plugin goes through `bindLazyTool` first.
			runtime.bindLazyTool({
				registrationId,
				activate: async () => ({ handler: async () => undefined }),
			});
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
		expect(runtime.isToolExposed('delendai_alpha_run')).toBe(true);
		expect(runtime.evictIdlePlugins(Date.now() + 101)).toHaveLength(1);
		expect(
			runtime.getProjectContext({ workspaceRoot: '/workspace' })
				.warmPlugins,
		).toEqual([]);
	});

	it('awaits a managed lazy loader before explicit plugin activation', async () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			descriptors: [],
			plugins: [
				{
					id: 'prompts-pack',
					namespace: 'prompts-pack',
					toolRegistrationIds: [],
				},
			],
		});
		let loaded = false;
		runtime.setLazyPluginLoader?.(async (pluginId) => {
			expect(pluginId).toBe('prompts-pack');
			loaded = true;
		});

		const change = await runtime.activatePluginAsync?.('prompts-pack');
		expect(loaded).toBe(true);
		expect(change?.pluginId).toBe('prompts-pack');
		expect(change?.active).toBe(true);
	});

	it('does not evict a plugin while a routed call holds an active lease', async () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			workingSet: { idleTtlMs: 100, maxWarmPlugins: 1 },
			descriptors: [
				{
					registrationId: 'memory_save',
					name: 'delendai_memory_save',
					toolId: 'save',
					pluginId: 'memory',
					namespace: 'memory',
				},
			],
			plugins: [
				{
					id: 'memory',
					namespace: 'memory',
					toolRegistrationIds: ['memory_save'],
				},
			],
		});
		let release!: () => void;
		let markStarted!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		runtime.bindLazyTool({
			registrationId: 'memory_save',
			activate: async () => ({
				handler: async () => ({ ok: true }),
			}),
		});
		runtime.bindRegisteredTool({
			registrationId: 'memory_save',
			name: 'delendai_memory_save',
			handler: async () => {
				markStarted();
				await blocked;
				return { ok: true };
			},
			handle: makeHandle(),
		});
		runtime.activatePlugin('memory');
		const call = runtime.invokeTool('delendai_memory_save', {}, {});
		await started;
		expect(runtime.evictIdlePlugins(Date.now() + 101)).toEqual([]);
		release();
		await call;
		expect(runtime.evictIdlePlugins(Date.now() + 101)).toEqual(['memory']);
	});
});

describe('tool-surface-runtime access state (visibility vs. authorization)', () => {
	const buildDeactivatableRuntime = (mode: 'native' | 'compact' = 'native') =>
		createToolSurfaceRuntime({
			mode,
			bootstrapToolIds: ['overview'],
			routerToolId: 'vertex',
			descriptors: [
				{
					registrationId: 'reports_run',
					name: 'delendai_reports_run',
					toolId: 'run',
					pluginId: 'reports',
					namespace: 'reports',
				},
			],
			plugins: [
				{
					id: 'reports',
					namespace: 'reports',
					toolRegistrationIds: ['reports_run'],
				},
			],
		});

	it('a tool hidden by surface mode (compact) stays routable — legitimate compact/adaptive behaviour', async () => {
		const runtime = buildDeactivatableRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.applySurfaceMode('compact');

		expect(runtime.isToolExposed('delendai_reports_run')).toBe(false);
		const route = runtime.resolveRoute('reports', 'run');
		expect(route?.active).toBe(false);
		await expect(
			runtime.invokeTool('delendai_reports_run', {}, {}),
		).resolves.toEqual({ ok: true });
	});

	it('deactivating a plugin refuses invokeTool with a typed error, even though the route still resolves', async () => {
		const runtime = buildDeactivatableRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();

		const change = runtime.deactivatePlugin('reports');
		expect(change?.active).toBe(false);
		expect(runtime.isToolExposed('delendai_reports_run')).toBe(false);

		// resolveRoute still finds the tool — routing metadata is not gated
		// by authorization — but invokeTool must refuse to run it.
		const route = runtime.resolveRoute('reports', 'run');
		expect(route?.name).toBe('delendai_reports_run');

		await expect(
			runtime.invokeTool('delendai_reports_run', {}, {}),
		).rejects.toBeInstanceOf(ToolNotAuthorizedError);
	});

	it('a surface-mode change cannot silently re-expose a deactivated tool', () => {
		const runtime = buildDeactivatableRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.deactivatePlugin('reports');

		runtime.applySurfaceMode('native');

		expect(runtime.isToolExposed('delendai_reports_run')).toBe(false);
	});

	it('reactivating a plugin restores both visibility and authorization', async () => {
		const runtime = buildDeactivatableRuntime('native');
		runtime.bindRegisteredTool({
			registrationId: 'reports_run',
			name: 'delendai_reports_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(true),
		});
		runtime.finalizeInitialSurface();
		runtime.deactivatePlugin('reports');
		runtime.activatePlugin('reports');

		expect(runtime.isToolExposed('delendai_reports_run')).toBe(true);
		await expect(
			runtime.invokeTool('delendai_reports_run', {}, {}),
		).resolves.toEqual({ ok: true });
	});
});
