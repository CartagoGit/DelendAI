/**
 * discovery.spec.ts — the lazy plugin scan, and the three things it
 * promises that are easy to break: it scans once, it re-scans when the
 * workspace changed, and two callers arriving together do not become two
 * scans.
 *
 * Every dependency is injected, so none of this needs a filesystem.
 */
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createLazyPluginDiscovery,
	createWorkspaceLazyPluginDiscovery,
	listWorkspacePluginIds,
	readWorkspacePluginDiscoveryCacheToken,
} from '@delendai/core/lib/plugins/discovery';
import type { IPluginManifest } from '@delendai/core/lib/plugins/lazy-loader';

const manifest = (
	id: string,
	overrides: Partial<IPluginManifest> = {},
): IPluginManifest => ({
	id,
	version: '1.0.0',
	toolNames: [`${id}_tool`],
	promptNames: [`${id}_prompt`],
	resourceUris: [`delendai://${id}`],
	...overrides,
});

/** A loader that counts reads and can be told to fail for an id. */
const loader = (missing: readonly string[] = []) => {
	const reads: string[] = [];
	return {
		reads,
		readManifest: async (
			id: string,
		): Promise<IPluginManifest | undefined> => {
			reads.push(id);
			return missing.includes(id) ? undefined : manifest(id);
		},
	};
};

describe('createLazyPluginDiscovery', () => {
	it('scans once and serves the rest from cache', async () => {
		const backing = loader();
		const discovery = createLazyPluginDiscovery({
			loader: backing,
			listPluginIds: async () => ['b', 'a'],
		});

		await discovery.manifests();
		await discovery.manifests();
		await discovery.pluginIds();

		expect(backing.reads).toHaveLength(2);
		const stats = discovery.stats();
		expect(stats.cacheMisses).toBe(1);
		expect(stats.cacheHits).toBe(2);
	});

	it('returns plugin ids in a stable order, whatever order they arrive in', async () => {
		// Two agents reading the same workspace must see the same list, or
		// anything derived from its order disagrees between them.
		const discovery = createLazyPluginDiscovery({
			loader: loader(),
			listPluginIds: async () => ['zeta', 'alpha', 'mid'],
		});
		expect(await discovery.pluginIds()).toEqual(['alpha', 'mid', 'zeta']);
	});

	it('re-scans when the workspace token changes, and not before', async () => {
		const backing = loader();
		let token = 'token-1';
		const discovery = createLazyPluginDiscovery({
			loader: backing,
			listPluginIds: async () => ['a'],
			readCacheToken: async () => token,
		});

		await discovery.manifests();
		await discovery.manifests();
		expect(backing.reads).toHaveLength(1);

		token = 'token-2';
		await discovery.manifests();
		expect(backing.reads).toHaveLength(2);
		expect(discovery.stats().lastCacheToken).toBe('token-2');
	});

	it('does not turn two simultaneous callers into two scans', async () => {
		// The in-flight guard. Without it every cold start pays the scan
		// once per caller that happened to arrive during it.
		const backing = loader();
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const discovery = createLazyPluginDiscovery({
			loader: backing,
			listPluginIds: async () => {
				await gate;
				return ['a', 'b'];
			},
		});

		const both = Promise.all([
			discovery.manifests(),
			discovery.manifests(),
		]);
		release?.();
		const [first, second] = await both;

		expect(backing.reads).toHaveLength(2);
		expect(discovery.stats().cacheMisses).toBe(1);
		expect(first).toEqual(second);
	});

	it('drops a plugin whose manifest cannot be read, and keeps the rest', async () => {
		// One broken plugin must not take the workspace with it.
		const discovery = createLazyPluginDiscovery({
			loader: loader(['broken']),
			listPluginIds: async () => ['broken', 'fine'],
		});

		expect((await discovery.manifests()).map((m) => m.id)).toEqual([
			'fine',
		]);
		// The id is still listed: it exists, it just could not be read.
		expect(await discovery.pluginIds()).toEqual(['broken', 'fine']);
	});

	it('finds the owner of a tool, a prompt and a resource, and says so when there is none', async () => {
		const discovery = createLazyPluginDiscovery({
			loader: loader(),
			listPluginIds: async () => ['alpha'],
		});

		expect((await discovery.findToolOwner('alpha_tool'))?.id).toBe('alpha');
		expect((await discovery.findPromptOwner('alpha_prompt'))?.id).toBe(
			'alpha',
		);
		expect(
			(await discovery.findResourceOwner('delendai://alpha'))?.id,
		).toBe('alpha');
		expect(await discovery.findToolOwner('nobody_tool')).toBeUndefined();
	});

	it('forgets everything on invalidate, including a scan already under way', async () => {
		const backing = loader();
		const discovery = createLazyPluginDiscovery({
			loader: backing,
			listPluginIds: async () => ['a'],
		});

		await discovery.manifests();
		discovery.invalidate();
		await discovery.manifests();

		expect(backing.reads).toHaveLength(2);
		expect(discovery.stats().cacheMisses).toBe(2);
	});

	it('reports empty statistics before anything has been scanned', async () => {
		// `stats()` is observability; it must never be the thing that
		// triggers the scan it is reporting on.
		const backing = loader();
		const discovery = createLazyPluginDiscovery({
			loader: backing,
			listPluginIds: async () => ['a'],
		});

		expect(discovery.stats()).toEqual({
			cacheHits: 0,
			cacheMisses: 0,
			manifestReads: 0,
			manifestCount: 0,
			lastScanMs: 0,
		});
		expect(backing.reads).toHaveLength(0);
	});

	it('works with no cache token at all, and reports none', async () => {
		const discovery = createLazyPluginDiscovery({
			loader: loader(),
			listPluginIds: async () => ['a'],
		});
		await discovery.manifests();
		expect(discovery.stats().lastCacheToken).toBeUndefined();
	});
});

describe('the workspace scan', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	/** A plugins directory where only some entries carry a manifest. */
	const workspace = (
		layout: Readonly<Record<string, 'manifest' | 'bare' | 'file'>>,
	): string => {
		const root = mkdtempSync(join(tmpdir(), 'plugin-discovery-'));
		roots.push(root);
		mkdirSync(join(root, 'plugins'), { recursive: true });
		for (const [name, kind] of Object.entries(layout)) {
			if (kind === 'file') {
				writeFileSync(join(root, 'plugins', name), 'not a directory');
				continue;
			}
			mkdirSync(join(root, 'plugins', name), { recursive: true });
			if (kind === 'manifest') {
				writeFileSync(
					join(root, 'plugins', name, 'plugin.manifest.ts'),
					`export const manifest = { id: '${name}' };`,
				);
			}
		}
		return root;
	};

	it('lists only directories that actually carry a manifest', async () => {
		// A half-created plugin directory is not a plugin, and a loose
		// file in `plugins/` is not one either.
		const root = workspace({
			beta: 'manifest',
			alpha: 'manifest',
			'half-made': 'bare',
			'stray.txt': 'file',
		});
		expect(await listWorkspacePluginIds({ rootDir: root })).toEqual([
			'alpha',
			'beta',
		]);
	});

	it('reports no plugins rather than failing when there is no plugins directory', async () => {
		// A workspace that has not created one yet is empty, not broken.
		const root = mkdtempSync(join(tmpdir(), 'plugin-discovery-none-'));
		roots.push(root);
		expect(await listWorkspacePluginIds({ rootDir: root })).toEqual([]);
	});

	it('builds a token that changes when a manifest does', async () => {
		const root = workspace({ alpha: 'manifest' });
		const before = await readWorkspacePluginDiscoveryCacheToken({
			rootDir: root,
		});

		const manifestPath = join(
			root,
			'plugins',
			'alpha',
			'plugin.manifest.ts',
		);
		const future = new Date(Date.now() + 5_000);
		utimesSync(manifestPath, future, future);

		expect(
			await readWorkspacePluginDiscoveryCacheToken({ rootDir: root }),
		).not.toBe(before);
	});

	it('marks a plugin whose manifest vanished, instead of dropping it from the token', async () => {
		// A directory that lost its manifest is a CHANGE, and a token that
		// ignored it would keep serving the cached scan.
		const root = workspace({ alpha: 'bare' });
		expect(
			await readWorkspacePluginDiscoveryCacheToken({ rootDir: root }),
		).toContain('alpha:missing');
	});

	it('says `missing` for a workspace with no plugins directory at all', async () => {
		const root = mkdtempSync(join(tmpdir(), 'plugin-discovery-none-'));
		roots.push(root);
		expect(
			await readWorkspacePluginDiscoveryCacheToken({ rootDir: root }),
		).toBe('missing');
	});

	it('wires the workspace scan into a discovery that re-scans on change', async () => {
		const root = workspace({ alpha: 'manifest' });
		const discovery = createWorkspaceLazyPluginDiscovery({
			loader: {
				readManifest: async (id: string) => ({
					id,
					version: '1.0.0',
					toolNames: [],
					promptNames: [],
					resourceUris: [],
				}),
			},
			rootDir: root,
		});

		expect(await discovery.pluginIds()).toEqual(['alpha']);
		expect(discovery.stats().cacheMisses).toBe(1);

		await discovery.pluginIds();
		expect(discovery.stats().cacheHits).toBe(1);
	});
});
