/**
 * lifecycle.spec.ts — f00184 (Track D).
 *
 * Covers the phased lifecycle: prepare / activate / dispose.
 * Validates the adapter that wraps legacy `register(ctx)`
 * plugins so existing plugins keep working unchanged.
 */

import { describe, expect, it, vi } from 'vitest';

import { adaptLegacyPlugin, definePlugin } from '@mcp-vertex/core/public';
import {
	hasPhasedLifecycle,
	runLifecycle,
	safeDispose,
} from '@mcp-vertex/core/public';
import type { IPhasedLifecycle } from '@mcp-vertex/core/public';
import type { IToolRegistration } from '../../../../src/lib/contracts/interfaces/tool-registration.interface';
import type { ILazyPluginDiscovery } from '../../../../src/lib/plugins/discovery';
import { adaptLegacyLifecycle } from '../../../../src/lib/plugins/lifecycle';
import type {
	ILazyPluginLoader,
	IPluginManifest,
} from '../../../../src/lib/plugins/lazy-loader';
import { createLazyPluginRouter } from '../../../../src/lib/plugins/router';
import type { IMcpPluginContext } from '../../../../src/lib/plugins/plugin-contract';

describe('f00184 — phased plugin lifecycle', () => {
	it('hasPhasedLifecycle returns true when all 3 methods exist', () => {
		const plugin = {
			prepare: async () => ({}),
			activate: async () => ({}),
			dispose: async () => {},
		};
		expect(hasPhasedLifecycle(plugin)).toBe(true);
	});

	it('hasPhasedLifecycle returns false when any method is missing', () => {
		expect(hasPhasedLifecycle({ prepare: async () => ({}) })).toBe(false);
		expect(hasPhasedLifecycle({ register: () => ({}) })).toBe(false);
		expect(hasPhasedLifecycle(null)).toBe(false);
		expect(hasPhasedLifecycle('string')).toBe(false);
	});

	it('runLifecycle composes prepare + activate', async () => {
		const calls: string[] = [];
		const lifecycle: IPhasedLifecycle<
			{ config: string },
			{ active: boolean }
		> = {
			async prepare(ctx) {
				calls.push(`prepare:${ctx.name}`);
				return { config: 'ok' };
			},
			async activate(prepared, ctx) {
				calls.push(`activate:${prepared.config}:${ctx.name}`);
				return { active: true };
			},
			async dispose() {
				calls.push('dispose');
			},
		};
		const active = await runLifecycle(
			lifecycle,
			{ name: 'p1', manifest: {}, configResolved: {}, logger: console },
			{
				name: 'p1',
				manifest: {},
				configResolved: {},
				logger: console,
				capabilities: {},
			},
		);
		expect(active).toEqual({ active: true });
		expect(calls).toEqual(['prepare:p1', 'activate:ok:p1']);
	});

	it('safeDispose swallows errors and is idempotent', async () => {
		const dispose = async () => {
			throw new Error('first call explodes');
		};
		// First call: error swallowed.
		await expect(safeDispose(dispose, {})).resolves.toBeUndefined();
		// Second call: same.
		await expect(safeDispose(dispose, {})).resolves.toBeUndefined();
	});

	it('safeDispose is a no-op when dispose is undefined', async () => {
		await expect(safeDispose(undefined, {})).resolves.toBeUndefined();
	});

	it('safeDispose runs cleanup exactly once for the same active payload', async () => {
		let calls = 0;
		const active = { resource: 'handle-1' };
		const dispose = async (payload: typeof active) => {
			calls += 1;
			expect(payload).toBe(active);
		};
		await safeDispose(dispose, active);
		await safeDispose(dispose, active);
		await safeDispose(dispose, active);
		expect(calls).toBe(1);
	});

	it('safeDispose: N simultaneous callers settle on exactly one cleanup', async () => {
		let calls = 0;
		let resolveDispose!: () => void;
		const disposeStarted = new Promise<void>((resolve) => {
			resolveDispose = resolve;
		});
		const active = { resource: 'handle-2' };
		const dispose = async () => {
			calls += 1;
			resolveDispose();
			// Yield so concurrent callers genuinely overlap in-flight.
			await new Promise((resolve) => setTimeout(resolve, 5));
		};

		const callers = Array.from({ length: 10 }, () =>
			safeDispose(dispose, active),
		);
		await disposeStarted;
		await Promise.all(callers);

		expect(calls).toBe(1);
	});

	it('safeDispose keeps independent payloads independent', async () => {
		let calls = 0;
		const dispose = async () => {
			calls += 1;
		};
		await Promise.all([
			safeDispose(dispose, { id: 1 }),
			safeDispose(dispose, { id: 2 }),
		]);
		expect(calls).toBe(2);
	});

	it('adaptLegacyPlugin runs the legacy register() in activate()', async () => {
		const plugin = definePlugin({
			name: 'legacy-1',
			async register() {
				return { tools: [] };
			},
		});
		const adapted = adaptLegacyPlugin(plugin);
		const active = await adapted.activate(
			{ name: 'legacy-1', plugin },
			{} as never,
		);
		expect(active).toBeDefined();
		// dispose is a no-op for legacy plugins (no IPluginRuntime).
		await expect(adapted.dispose(active)).resolves.toBeUndefined();
	});

	it('adaptLegacyLifecycle passes the full plugin context and disposes runtimes once', async () => {
		const dispose = vi.fn();
		const signal = new AbortController().signal;
		// Only `options` is read on this path; the cast goes through
		// `unknown` because a partial context does not overlap the full
		// interface.
		const pluginContext = {
			options: { source: 'router' },
		} as unknown as IMcpPluginContext;
		const plugin = definePlugin({
			name: 'legacy-ctx',
			async register(ctx, receivedSignal) {
				expect(ctx).toBe(pluginContext);
				expect(receivedSignal).toBe(signal);
				return {
					registrations: { tools: [] },
					dispose,
				};
			},
		});
		const lifecycle = adaptLegacyLifecycle(plugin, pluginContext, signal);
		const prepared = await lifecycle.prepare({
			name: 'legacy-ctx',
			manifest: {},
			configResolved: {},
			logger: console,
		});
		const active = await lifecycle.activate(prepared, {
			name: 'legacy-ctx',
			manifest: {},
			configResolved: {},
			logger: console,
			capabilities: {},
		});
		await lifecycle.dispose(active);
		await lifecycle.dispose(active);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('router runs phased prepare + activate before capturing tool bindings', async () => {
		const calls: string[] = [];
		const manifest: IPluginManifest = {
			id: 'phased-plugin',
			version: '1.0.0',
			toolNames: ['phased_tool'],
			promptNames: [],
			resourceUris: [],
		};
		const registration: IToolRegistration = {
			id: 'phased-tool-registration',
			async register(server) {
				server.registerTool(
					'phased_tool',
					{ description: 'phased tool' },
					async () => ({
						content: [{ type: 'text' as const, text: 'ok' }],
					}),
				);
			},
		};
		const plugin = {
			name: 'phased-plugin',
			async register() {
				throw new Error('legacy register path should not run');
			},
			async prepare(ctx: { name: string; manifest: IPluginManifest }) {
				calls.push(`prepare:${ctx.name}:${ctx.manifest.id}`);
				return { prepared: true };
			},
			async activate(
				prepared: { prepared: boolean },
				ctx: { name: string; capabilities: Record<string, never> },
			) {
				calls.push(
					`activate:${prepared.prepared}:${ctx.name}:${Object.keys(ctx.capabilities).length}`,
				);
				return { tools: [registration] };
			},
			async dispose() {},
		};
		const loader: Pick<ILazyPluginLoader, 'load' | 'warmup' | 'state'> = {
			async load(id) {
				return {
					id,
					manifest,
					plugin: plugin as never,
					firstLoadMs: 0,
					loadedAt: Date.now(),
				};
			},
			async warmup() {
				return [];
			},
			state() {
				return 'loaded';
			},
		};
		const discovery: ILazyPluginDiscovery = {
			async pluginIds() {
				return [manifest.id];
			},
			async manifests() {
				return [manifest];
			},
			async findToolOwner(toolName) {
				return toolName === 'phased_tool' ? manifest : undefined;
			},
			async findPromptOwner() {
				return undefined;
			},
			async findResourceOwner() {
				return undefined;
			},
			invalidate() {},
			stats() {
				return {
					cacheHits: 0,
					cacheMisses: 0,
					manifestReads: 0,
					manifestCount: 1,
					lastScanMs: 0,
				};
			},
		};
		const router = createLazyPluginRouter({
			loader,
			discovery,
			buildContext: () => ({ options: { source: 'router' } }) as never,
		});

		const loaded = await router.loadToolOwner('phased_tool');

		expect(loaded.binding?.description).toBe('phased tool');
		expect(calls).toEqual([
			'prepare:phased-plugin:phased-plugin',
			'activate:true:phased-plugin:0',
		]);
	});

	it('prepare-throws skips activate (router can rollback)', async () => {
		const calls: string[] = [];
		const lifecycle: IPhasedLifecycle = {
			async prepare() {
				calls.push('prepare');
				throw new Error('config invalid');
			},
			async activate() {
				calls.push('activate');
				return {};
			},
			async dispose() {
				calls.push('dispose');
			},
		};
		await expect(
			runLifecycle(
				lifecycle,
				{
					name: 'p',
					manifest: {},
					configResolved: {},
					logger: console,
				},
				{
					name: 'p',
					manifest: {},
					configResolved: {},
					logger: console,
					capabilities: {},
				},
			),
		).rejects.toThrow('config invalid');
		expect(calls).toEqual(['prepare']);
	});
});
