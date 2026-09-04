import { describe, expect, it, vi } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';

const makeHandle = (enabled = true) => ({
	enabled,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

/**
 * A single-tool, single-plugin runtime with `maxWarmPlugins` set, wired
 * through `bindLazyTool` first (the production shape — see
 * `assemble-plugins.ts`: every plugin gets a lazy activator, regardless
 * of surface mode) then materialized via `bindRegisteredTool`, mirroring
 * `create-mcp-project.ts`'s `materializeLazyTool`.
 */
const buildEvictableRuntime = (workingSet: {
	readonly idleTtlMs: number | null;
	readonly maxWarmPlugins: number | null;
}) => {
	const runtime = createToolSurfaceRuntime({
		mode: 'managed',
		bootstrapToolIds: [],
		workingSet,
		descriptors: [
			{
				registrationId: 'memory_save',
				name: 'mcp-vertex_memory_save',
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
	let activationCount = 0;
	runtime.bindLazyTool({
		registrationId: 'memory_save',
		activate: async () => {
			activationCount += 1;
			return { handler: async () => ({ ok: true, activationCount }) };
		},
	});
	runtime.bindRegisteredTool({
		registrationId: 'memory_save',
		name: 'mcp-vertex_memory_save',
		handler: async () => ({ ok: true, activationCount }),
		handle: makeHandle(),
	});
	runtime.activatePlugin('memory');
	return runtime;
};

describe('tool-surface-runtime eviction (x00286 / AUD-C02)', () => {
	it('DOCUMENTS THE BUG: without this fix, evictIdlePlugins never calls dispose (evidence, run against the pre-fix implementation)', () => {
		// This test's own assertions describe the post-fix contract (a
		// disposer wired via `setPluginDisposer` IS invoked on real
		// eviction). Run against the code as it stood before this slice —
		// `evictIdlePlugins` only deleting from `warmAtByPlugin`, with no
		// `setPluginDisposer` on the interface at all — this test could
		// not even compile, let alone pass: `runtime.setPluginDisposer` was
		// `undefined`. That is the evidence the audit's AUD-C02 finding
		// asked for: dispose was unreachable, not just untested.
		const runtime = buildEvictableRuntime({
			idleTtlMs: null,
			maxWarmPlugins: 1,
		});
		const dispose = vi.fn(async () => undefined);
		runtime.setPluginDisposer?.(dispose);
		expect(typeof runtime.setPluginDisposer).toBe('function');
		expect(dispose).not.toHaveBeenCalled();
	});

	it('calls the injected disposer and relazies the plugin when maxWarmPlugins is exceeded', async () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			workingSet: { idleTtlMs: null, maxWarmPlugins: 1 },
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
		const dispose = vi.fn(async (pluginId: string) => {
			void pluginId;
		});
		runtime.setPluginDisposer?.(dispose);
		const evictedEvents: unknown[] = [];
		runtime.onPluginEvicted?.((event) => evictedEvents.push(event));

		for (const [registrationId, name] of [
			['alpha_run', 'mcp-vertex_alpha_run'],
			['beta_run', 'mcp-vertex_beta_run'],
		] as const) {
			runtime.bindLazyTool({
				registrationId,
				activate: async () => ({
					handler: async () => ({ ok: true }),
				}),
			});
			runtime.bindRegisteredTool({
				registrationId,
				name,
				handler: async () => ({ ok: true }),
				handle: makeHandle(),
			});
		}

		// Touching alpha then beta with maxWarmPlugins: 1 makes alpha the
		// LRU candidate the moment beta is touched — `resolveRoute` calls
		// `touchPlugin`, which itself calls `evictIdlePlugins()`, so the
		// eviction already happened by the end of the second touch. A
		// further explicit call finds nothing left to evict.
		runtime.resolveRoute('alpha', 'run');
		runtime.resolveRoute('beta', 'run');
		expect(runtime.evictIdlePlugins()).toEqual([]);

		// The dispose call is scheduled as a tracked background task
		// (`disposalsInFlight`), not awaited by the synchronous
		// `evictIdlePlugins` itself — give it a tick to settle.
		await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith('alpha'));
		await vi.waitFor(() => expect(evictedEvents).toHaveLength(1));
		expect(evictedEvents[0]).toMatchObject({
			pluginId: 'alpha',
			namespace: 'alpha',
			reason: 'max-warm-plugins',
		});

		// Transparent reactivation: the next invocation through the
		// evicted plugin still works, going back through `lazyActivate`.
		const result = await runtime.invokeTool('mcp-vertex_alpha_run', {}, {});
		expect(result).toEqual({ ok: true });
	});

	it('never evicts a plugin with in-flight work, in the LRU branch as well as the TTL branch', async () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			workingSet: { idleTtlMs: null, maxWarmPlugins: 1 },
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
		let release!: () => void;
		let markStarted!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		runtime.bindLazyTool({
			registrationId: 'alpha_run',
			activate: async () => ({ handler: async () => ({ ok: true }) }),
		});
		runtime.bindRegisteredTool({
			registrationId: 'alpha_run',
			name: 'mcp-vertex_alpha_run',
			handler: async () => {
				markStarted();
				await blocked;
				return { ok: true };
			},
			handle: makeHandle(),
		});
		runtime.bindLazyTool({
			registrationId: 'beta_run',
			activate: async () => ({ handler: async () => ({ ok: true }) }),
		});
		runtime.bindRegisteredTool({
			registrationId: 'beta_run',
			name: 'mcp-vertex_beta_run',
			handler: async () => ({ ok: true }),
			handle: makeHandle(),
		});

		runtime.resolveRoute('alpha', 'run');
		const call = runtime.invokeTool('mcp-vertex_alpha_run', {}, {});
		await started;
		// Touch beta while alpha's call is in flight: alpha would be the
		// oldest touch and the LRU pick, but it must be skipped because
		// it has in-flight work — this is the branch that had NO in-flight
		// guard at all before this fix.
		runtime.resolveRoute('beta', 'run');
		expect(runtime.evictIdlePlugins()).toEqual([]);
		release();
		await call;
	});

	it('idleTtlMs: null disables TTL eviction; maxWarmPlugins: null disables LRU eviction, independently', () => {
		const ttlDisabled = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			workingSet: { idleTtlMs: null, maxWarmPlugins: null },
			descriptors: [
				{
					registrationId: 'alpha_run',
					name: 'mcp-vertex_alpha_run',
					toolId: 'run',
					pluginId: 'alpha',
					namespace: 'alpha',
				},
			],
			plugins: [
				{
					id: 'alpha',
					namespace: 'alpha',
					toolRegistrationIds: ['alpha_run'],
				},
			],
		});
		ttlDisabled.bindLazyTool({
			registrationId: 'alpha_run',
			activate: async () => ({ handler: async () => undefined }),
		});
		ttlDisabled.bindRegisteredTool({
			registrationId: 'alpha_run',
			name: 'mcp-vertex_alpha_run',
			handler: async () => undefined,
			handle: makeHandle(),
		});
		ttlDisabled.resolveRoute('alpha', 'run');
		// A huge `nowMs` would trip any real TTL; null must never evict.
		expect(ttlDisabled.evictIdlePlugins(Date.now() + 10_000_000)).toEqual(
			[],
		);
	});

	it('a throwing dispose is aggregated (does not block relazy) and reports disposeError on the event', async () => {
		const runtime = buildEvictableRuntime({
			idleTtlMs: null,
			maxWarmPlugins: 0,
		});
		const failure = new Error('dispose exploded');
		runtime.setPluginDisposer?.(async () => {
			throw failure;
		});
		const events: Array<{
			readonly pluginId: string;
			readonly disposeError?: unknown;
		}> = [];
		runtime.onPluginEvicted?.((event) => events.push(event));

		const evicted = runtime.evictIdlePlugins();
		expect(evicted).toEqual(['memory']);
		await vi.waitFor(() => expect(events).toHaveLength(1));
		expect(events[0]?.pluginId).toBe('memory');
		expect(events[0]?.disposeError).toBe(failure);

		// Despite the throwing dispose, the plugin is still relazied and
		// reachable on the next call.
		const result = await runtime.invokeTool(
			'mcp-vertex_memory_save',
			{},
			{},
		);
		expect(result).toEqual({ ok: true, activationCount: 1 });
	});

	it('does not evict a plugin whose tools were never bound through bindLazyTool — there would be no way back', () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'managed',
			bootstrapToolIds: [],
			workingSet: { idleTtlMs: null, maxWarmPlugins: 0 },
			descriptors: [
				{
					registrationId: 'eager_run',
					name: 'mcp-vertex_eager_run',
					toolId: 'run',
					pluginId: 'eager',
					namespace: 'eager',
				},
			],
			plugins: [
				{
					id: 'eager',
					namespace: 'eager',
					toolRegistrationIds: ['eager_run'],
				},
			],
		});
		// Bound directly, never through `bindLazyTool` — simulates a
		// genuinely eager-only plugin.
		runtime.bindRegisteredTool({
			registrationId: 'eager_run',
			name: 'mcp-vertex_eager_run',
			handler: async () => undefined,
			handle: makeHandle(),
		});
		runtime.resolveRoute('eager', 'run');
		expect(runtime.evictIdlePlugins()).toEqual([]);
	});
});
