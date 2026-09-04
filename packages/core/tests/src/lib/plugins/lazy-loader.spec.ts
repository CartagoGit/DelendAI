#!/usr/bin/env bun
/**
 * lazy-loader.spec.ts — f00200 (Track N / q00006 §52).
 *
 * Synthetic test: manifests are an in-memory map, importer is a
 * counter that "resolves" each plugin id on demand. The tests
 * verify (a) modules are NOT imported at boot, (b) the first
 * `load(id)` does the import and caches it, (c) concurrent
 * `load(id)` calls share the in-flight promise, (d) warmup is
 * best-effort and surfaces failures without throwing,
 * (e) unload clears the cache, (f) stats accumulate correctly,
 * (g) readManifest does NOT import.
 */

import { describe, expect, it } from 'vitest';

import {
	createLazyPluginLoader,
	type IPluginManifest,
	type ILazyPluginLoader,
	type PluginModuleImporter,
} from '../../../../src/lib/plugins/lazy-loader';
import { createLazyPluginDiscovery } from '../../../../src/lib/plugins/discovery';
import { createLazyPluginRouter } from '../../../../src/lib/plugins/router';
import type { IMcpPluginContext } from '../../../../src/lib/plugins/plugin-contract';
import type { IMcpPluginRegistrations } from '../../../../src/lib/plugins/plugin-contract';

interface IFakePlugin {
	readonly name: string;
	readonly version: string;
	readonly describe?: string;
	register: () => Promise<IMcpPluginRegistrations>;
}

const FAKE_PLUGIN: IFakePlugin = {
	name: 'fake',
	version: '0.0.0',
	register: async () => ({}) as IMcpPluginRegistrations,
};

const manifest = (id: string): IPluginManifest => ({
	id,
	version: '0.0.0',
	toolNames: [`${id}.tool_a`, `${id}.tool_b`],
	promptNames: [],
	resourceUris: [],
});

interface ITestRig {
	loader: ILazyPluginLoader;
	importCount: Map<string, number>;
	resolveManifest: (id: string) => Promise<IPluginManifest | undefined>;
}

const wait = async (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const totalImports = (importCount: ReadonlyMap<string, number>): number =>
	[...importCount.values()].reduce((sum, count) => sum + count, 0);

const buildRig = (
	manifestIds: readonly string[] = ['git', 'docs', 'core'],
	options?: {
		readonly importDelayMs?: number;
		readonly onResolveManifest?: () => void;
	},
): ITestRig => {
	const importCount = new Map<string, number>();
	const resolveManifest = async (
		id: string,
	): Promise<IPluginManifest | undefined> => {
		options?.onResolveManifest?.();
		if (!manifestIds.includes(id)) return undefined;
		return manifest(id);
	};
	const importer: PluginModuleImporter = async (specifier: string) => {
		const id = specifier.replace(/^@delendai\//, '');
		if ((options?.importDelayMs ?? 0) > 0) {
			await wait(options?.importDelayMs ?? 0);
		}
		importCount.set(id, (importCount.get(id) ?? 0) + 1);
		return { default: FAKE_PLUGIN };
	};
	const loader = createLazyPluginLoader({
		resolveSpecifier: (id) => `@delendai/${id}`,
		asPlugin: (mod) => {
			const candidate =
				mod && typeof mod === 'object' && 'default' in mod
					? (mod as { default: unknown }).default
					: mod;
			if (
				candidate &&
				typeof candidate === 'object' &&
				typeof (candidate as IFakePlugin).name === 'string' &&
				typeof (candidate as IFakePlugin).register === 'function'
			) {
				return candidate as IFakePlugin;
			}
			return undefined;
		},
		readManifest: resolveManifest,
		import: importer,
	});
	return { loader, importCount, resolveManifest };
};

const buildToolRoutingRig = () => {
	const importCount = new Map<string, number>();
	const importer: PluginModuleImporter = async (specifier: string) => {
		const id = specifier.replace(/^@delendai\//, '');
		importCount.set(id, (importCount.get(id) ?? 0) + 1);
		return {
			default: {
				name: id,
				version: '0.0.0',
				register: async () =>
					({
						tools: [
							{
								id: `${id}.tool_a`,
								register: async (server: {
									registerTool: (
										name: string,
										config: {
											description?: string;
											inputSchema?: unknown;
											outputSchema?: unknown;
										},
										handler: unknown,
									) => unknown;
								}) => {
									server.registerTool(
										`${id}.tool_a`,
										{ description: `${id} tool a` },
										async () => ({
											pluginId: id,
											tool: 'a',
										}),
									);
								},
							},
							{
								id: `${id}.tool_b`,
								register: async (server: {
									registerTool: (
										name: string,
										config: {
											description?: string;
											inputSchema?: unknown;
											outputSchema?: unknown;
										},
										handler: unknown,
									) => unknown;
								}) => {
									server.registerTool(
										`${id}.tool_b`,
										{ description: `${id} tool b` },
										async () => ({
											pluginId: id,
											tool: 'b',
										}),
									);
								},
							},
						],
					}) as IMcpPluginRegistrations,
			},
		};
	};
	const loader = createLazyPluginLoader({
		resolveSpecifier: (id) => `@delendai/${id}`,
		asPlugin: (mod) => {
			const candidate =
				mod && typeof mod === 'object' && 'default' in mod
					? (mod as { default: unknown }).default
					: mod;
			return candidate && typeof candidate === 'object'
				? (candidate as IFakePlugin)
				: undefined;
		},
		readManifest: async (id) =>
			['docs', 'search'].includes(id) ? manifest(id) : undefined,
		import: importer,
	});
	const discovery = createLazyPluginDiscovery({
		loader,
		listPluginIds: async () => ['docs', 'search'],
	});
	const router = createLazyPluginRouter({
		loader,
		discovery,
		buildContext: () => ({}) as IMcpPluginContext,
	});
	return { discovery, router, loader, importCount };
};

describe('lazy-loader (f00200) — boot semantics', () => {
	it('does NOT import modules on construction', () => {
		const { importCount } = buildRig();
		expect(totalImports(importCount)).toBe(0);
	});

	it('readManifest reads metadata without importing', async () => {
		const { loader, importCount } = buildRig();
		const m = await loader.readManifest('git');
		expect(m?.id).toBe('git');
		expect(importCount.get('git')).toBeUndefined();
	});

	it('returns undefined for unknown manifests', async () => {
		const { loader } = buildRig();
		expect(await loader.readManifest('nope')).toBeUndefined();
	});
});

describe('lazy-loader (f00200) — load semantics', () => {
	it('imports on first load and caches the entry', async () => {
		const { loader, importCount } = buildRig();
		const entry = await loader.load('git');
		expect(entry.id).toBe('git');
		expect(entry.plugin.name).toBe('fake');
		expect(entry.firstLoadMs).toBeGreaterThanOrEqual(0);
		expect(importCount.get('git')).toBe(1);

		const again = await loader.load('git');
		expect(again).toBe(entry); // same reference — cached
		expect(importCount.get('git')).toBe(1);
	});

	it('concurrent load() calls share the in-flight promise', async () => {
		const { loader, importCount } = buildRig();
		const [a, b, c] = await Promise.all([
			loader.load('docs'),
			loader.load('docs'),
			loader.load('docs'),
		]);
		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(importCount.get('docs')).toBe(1);
	});

	it('throws when the manifest is unknown', async () => {
		const { loader } = buildRig();
		await expect(loader.load('nope')).rejects.toThrow(/no manifest/);
	});

	it('reports the import error and marks the plugin failed', async () => {
		const loader = createLazyPluginLoader({
			resolveSpecifier: (id) => `@delendai/${id}`,
			asPlugin: () => undefined,
			readManifest: async (id) => manifest(id),
			import: async () => {
				throw new Error('boom');
			},
		});
		await expect(loader.load('git')).rejects.toThrow('boom');
		expect(loader.state('git')).toBe('failed');
		const snap = loader.snapshot();
		expect(snap.failed).toHaveLength(1);
		expect(snap.failed[0]?.error.message).toBe('boom');
	});

	it('counts failed attempts and re-raises each time', async () => {
		const loader = createLazyPluginLoader({
			resolveSpecifier: (id) => `@delendai/${id}`,
			asPlugin: () => undefined,
			readManifest: async (id) => manifest(id),
			import: async () => {
				throw new Error('still boom');
			},
		});
		await expect(loader.load('git')).rejects.toThrow();
		await expect(loader.load('git')).rejects.toThrow();
		const snap = loader.snapshot();
		expect(snap.failed[0]?.attemptCount).toBe(2);
	});
});

describe('lazy-loader (f00200) — warmup', () => {
	it('pre-loads a subset best-effort', async () => {
		const { loader, importCount } = buildRig();
		const failures = await loader.warmup(['git', 'docs', 'nope']);
		expect(failures).toHaveLength(0);
		expect(importCount.get('git')).toBe(1);
		expect(importCount.get('docs')).toBe(1);
		expect(loader.state('git')).toBe('loaded');
		expect(loader.state('docs')).toBe('loaded');
	});

	it('surfaces failures without throwing', async () => {
		const loader = createLazyPluginLoader({
			resolveSpecifier: (id) => `@delendai/${id}`,
			asPlugin: () => undefined,
			readManifest: async (id) => manifest(id),
			import: async () => {
				throw new Error('nope');
			},
		});
		const failures = await loader.warmup(['git', 'docs']);
		expect(failures).toHaveLength(2);
		expect(failures.map((f) => f.id).sort()).toEqual(['docs', 'git']);
	});
});

describe('lazy-loader (f00200) — state + snapshot + stats', () => {
	it('reports unloaded | pending | loaded | failed correctly', async () => {
		const { loader } = buildRig();
		expect(loader.state('git')).toBe('unloaded');
		await loader.load('git');
		expect(loader.state('git')).toBe('loaded');
	});

	it('snapshot exposes loaded + failed lists', async () => {
		const { loader } = buildRig();
		await loader.load('git');
		const snap = loader.snapshot();
		expect(snap.loaded.map((e) => e.id)).toEqual(['git']);
		expect(snap.failed).toEqual([]);
	});

	it('stats accumulate modulesImported + firstLoadTotalMs', async () => {
		const { loader } = buildRig();
		await loader.load('git');
		await loader.load('docs');
		await loader.load('git'); // cached — should NOT increment
		const s = loader.stats();
		expect(s.modulesImported).toBe(2);
		expect(s.firstLoadTotalMs).toBeGreaterThanOrEqual(0);
		expect(s.manifestsRead).toBeGreaterThanOrEqual(0);
	});

	it('clears the failed snapshot after a later successful retry', async () => {
		let shouldFail = true;
		const loader = createLazyPluginLoader({
			resolveSpecifier: (id) => `@delendai/${id}`,
			asPlugin: (mod) => {
				const candidate =
					mod && typeof mod === 'object' && 'default' in mod
						? (mod as { default: unknown }).default
						: mod;
				return candidate as IFakePlugin;
			},
			readManifest: async (id) => manifest(id),
			import: async () => {
				if (shouldFail) {
					shouldFail = false;
					throw new Error('boom once');
				}
				return { default: FAKE_PLUGIN };
			},
		});
		await expect(loader.load('git')).rejects.toThrow('boom once');
		expect(loader.snapshot().failed).toHaveLength(1);
		await expect(loader.load('git')).resolves.toMatchObject({ id: 'git' });
		expect(loader.snapshot().failed).toEqual([]);
	});
});

describe('lazy-loader (f00200) — unload + reset', () => {
	it('unload returns false when nothing is cached', async () => {
		const { loader } = buildRig();
		expect(await loader.unload('git')).toBe(false);
	});

	it('unload clears the cache so the next load re-imports', async () => {
		const { loader, importCount } = buildRig();
		await loader.load('git');
		expect(await loader.unload('git')).toBe(true);
		expect(loader.state('git')).toBe('unloaded');
		await loader.load('git');
		expect(importCount.get('git')).toBe(2);
	});

	it('reset clears everything', async () => {
		const { loader } = buildRig();
		await loader.load('git');
		await loader.load('docs');
		loader.reset();
		expect(loader.state('git')).toBe('unloaded');
		expect(loader.stats().modulesImported).toBe(0);
	});
});

describe('lazy-loader (f00200) — discovery + router integration', () => {
	it('discovers manifests without importing and caches by token', async () => {
		let cacheToken = 'v1';
		let manifestReads = 0;
		const { loader, importCount } = buildRig(['docs', 'git'], {
			onResolveManifest: () => {
				manifestReads += 1;
			},
		});
		const discovery = createLazyPluginDiscovery({
			loader,
			listPluginIds: async () => ['git', 'docs'],
			readCacheToken: async () => cacheToken,
		});

		const first = await discovery.manifests();
		const second = await discovery.manifests();

		expect(first.map((entry) => entry.id)).toEqual(['docs', 'git']);
		expect(second).toBe(first);
		expect(manifestReads).toBe(2);
		expect(importCount.size).toBe(0);
		expect(discovery.stats().cacheHits).toBe(1);

		cacheToken = 'v2';
		discovery.invalidate();
		await discovery.manifests();
		expect(manifestReads).toBe(2);
		expect(discovery.stats().cacheMisses).toBe(2);
	});

	it('routes the first tool call through the lazy loader on demand', async () => {
		const { loader, importCount } = buildRig(['git', 'docs'], {
			importDelayMs: 5,
		});
		const discovery = createLazyPluginDiscovery({
			loader,
			listPluginIds: async () => ['git', 'docs'],
		});
		const router = createLazyPluginRouter({
			loader,
			discovery,
			lazy: true,
		});

		const boot = await router.initialize();
		expect(boot.mode).toBe('lazy');
		expect(boot.eagerlyLoadedPluginCount).toBe(0);
		expect(importCount.size).toBe(0);

		const firstLoad = await router.loadToolOwner('git.tool_a');
		expect(firstLoad.route.pluginId).toBe('git');
		expect(firstLoad.cacheHit).toBe(false);
		expect(firstLoad.loadMs).toBeGreaterThanOrEqual(0);
		expect(importCount.get('git')).toBe(1);
		expect(importCount.get('docs')).toBeUndefined();

		const secondLoad = await router.loadToolOwner('git.tool_a');
		expect(secondLoad.cacheHit).toBe(true);
		expect(importCount.get('git')).toBe(1);
		expect(router.stats().cacheHits).toBe(1);
	});

	it('activates the owning plugin and returns the routed handler on first use', async () => {
		const { discovery, router, loader, importCount } =
			buildToolRoutingRig();

		await expect(
			discovery.findToolOwner('docs.tool_b'),
		).resolves.toMatchObject({ id: 'docs' });
		expect(loader.state('docs')).toBe('unloaded');
		expect(totalImports(importCount)).toBe(0);

		const firstLoad = await router.loadToolOwner('docs.tool_b');

		expect(firstLoad.route.pluginId).toBe('docs');
		expect(firstLoad.binding?.description).toBe('docs tool b');
		expect(loader.state('docs')).toBe('loaded');
		expect(totalImports(importCount)).toBe(1);
		expect(firstLoad.binding).toBeDefined();
		const handler = firstLoad.binding?.handler as
			| (() => Promise<unknown>)
			| undefined;
		expect(handler).toBeDefined();
		await expect(handler?.()).resolves.toEqual({
			pluginId: 'docs',
			tool: 'b',
		});

		const secondLoad = await router.loadToolOwner('docs.tool_a');
		expect(secondLoad.binding?.description).toBe('docs tool a');
		expect(totalImports(importCount)).toBe(1);
	});

	it('supports eager compatibility mode and measures lower lazy boot cost', async () => {
		const lazyRig = buildRig(['git', 'docs', 'core'], {
			importDelayMs: 15,
		});
		const eagerRig = buildRig(['git', 'docs', 'core'], {
			importDelayMs: 15,
		});
		const lazyDiscovery = createLazyPluginDiscovery({
			loader: lazyRig.loader,
			listPluginIds: async () => ['git', 'docs', 'core'],
		});
		const eagerDiscovery = createLazyPluginDiscovery({
			loader: eagerRig.loader,
			listPluginIds: async () => ['git', 'docs', 'core'],
		});
		const lazyRouter = createLazyPluginRouter({
			loader: lazyRig.loader,
			discovery: lazyDiscovery,
			lazy: true,
		});
		const eagerRouter = createLazyPluginRouter({
			loader: eagerRig.loader,
			discovery: eagerDiscovery,
			lazy: false,
		});

		const lazyBoot = await lazyRouter.initialize();
		const eagerBoot = await eagerRouter.initialize();

		expect(lazyBoot.bootMs).toBeLessThan(eagerBoot.bootMs);
		expect(lazyRig.importCount.size).toBe(0);
		expect(eagerRig.importCount.get('git')).toBe(1);
		expect(eagerRig.importCount.get('docs')).toBe(1);
		expect(eagerRig.importCount.get('core')).toBe(1);
		expect(eagerBoot.eagerlyLoadedPluginCount).toBe(3);

		const firstLazyCall = await lazyRouter.loadToolOwner('core.tool_a');
		expect(firstLazyCall.loadMs).toBeGreaterThan(0);
		expect(lazyRig.importCount.get('core')).toBe(1);
	});
});
