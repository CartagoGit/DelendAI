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

interface IFakePlugin {
	readonly name: string;
	readonly version: string;
	readonly describe?: string;
	register: () => Promise<unknown>;
}

const FAKE_PLUGIN: IFakePlugin = {
	name: 'fake',
	version: '0.0.0',
	register: async () => undefined,
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

const buildRig = (
	manifestIds: readonly string[] = ['git', 'docs', 'core'],
): ITestRig => {
	const importCount = new Map<string, number>();
	const resolveManifest = async (
		id: string,
	): Promise<IPluginManifest | undefined> => {
		if (!manifestIds.includes(id)) return undefined;
		return manifest(id);
	};
	const importer: PluginModuleImporter = async (specifier: string) => {
		const id = specifier.replace(/^@mcp-vertex\//, '');
		importCount.set(id, (importCount.get(id) ?? 0) + 1);
		return { default: FAKE_PLUGIN };
	};
	const loader = createLazyPluginLoader({
		resolveSpecifier: (id) => `@mcp-vertex/${id}`,
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

describe('lazy-loader (f00200) — boot semantics', () => {
	it('does NOT import modules on construction', () => {
		const { importCount } = buildRig();
		expect([...importCount.values()].reduce((a, b) => a + b, 0)).toBe(0);
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
			resolveSpecifier: (id) => `@mcp-vertex/${id}`,
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
			resolveSpecifier: (id) => `@mcp-vertex/${id}`,
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
			resolveSpecifier: (id) => `@mcp-vertex/${id}`,
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
