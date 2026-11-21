/**
 * lazy-loader.ts — f00200 (Track N / q00006 §52).
 *
 * Lazy loading for plugin modules. Instead of importing every
 * plugin at boot (which costs memory + start-up time on big
 * catalogues), the loader:
 *
 *   1. Reads only the **manifest** at boot — name, version, declared
 *      capabilities, declared entry-point — without importing the
 *      plugin's TypeScript module.
 *   2. Imports the module on first invocation (`tools/call`, prompt
 *      render, resource read, …) and caches the resolved module.
 *   3. Surfaces load-state per plugin (`unloaded | pending | loaded
 *      | failed`) so dashboards can report on first-use latency.
 *
 * The loader is **opt-in per host**: callers pass a map of
 * `pluginId → loader` (the dynamic-import wrapper is supplied by
 * the host, mirroring `load-plugins.ts` which already requires an
 * `import:` function in `ILoadPluginsOptions`). This module does NOT
 * import plugin modules itself — the host retains control so Vite
 * can statically analyse the bundle that ships in browser hosts.
 *
 * Privacy (R1.1–R1.10): the loader never logs args / outputs. The
 * only thing it persists is timing data and per-plugin state, both
 * of which are public (plugin ids are public).
 */

import type { IMcpPlugin } from './plugin-contract';

// ---------------------------------------------------------------------------
// Manifest (read at boot, no module import).
// ---------------------------------------------------------------------------

export interface IPluginManifest {
	readonly id: string;
	readonly version: string;
	/** Tool names this plugin declares. Used by the router to know
	 *  which plugin owns a given tool invocation without importing
	 *  the module. The host wires this up at manifest-read time. */
	readonly toolNames: readonly string[];
	/** Prompt names this plugin declares. Same purpose. */
	readonly promptNames: readonly string[];
	/** Resource URIs this plugin declares. Same purpose. */
	readonly resourceUris: readonly string[];
}

/** Read-only provider for manifests. The default implementation
 *  walks `plugins/<id>/plugin.json` lazily; tests inject an in-memory
 *  map. */
export type IManifestProvider = (
	id: string,
) => Promise<IPluginManifest | undefined>;

// ---------------------------------------------------------------------------
// Per-plugin load state.
// ---------------------------------------------------------------------------

export type PluginLoadState =
	| 'unloaded' // manifest known, module never imported
	| 'pending' // import in flight
	| 'loaded' // module resolved
	| 'failed'; // import threw; error cached

export interface ILoadedPluginEntry {
	readonly id: string;
	readonly manifest: IPluginManifest;
	readonly plugin: IMcpPlugin;
	/** Wall-clock milliseconds spent on the FIRST import. Subsequent
	 *  cache hits do not contribute. */
	readonly firstLoadMs: number;
	/** Wall-clock timestamp when the first load resolved. */
	readonly loadedAt: number;
}

export interface IFailedPluginEntry {
	readonly id: string;
	readonly manifest: IPluginManifest;
	readonly error: Error;
	readonly failedAt: number;
	readonly attemptCount: number;
}

// ---------------------------------------------------------------------------
// Loader interface + factory.
// ---------------------------------------------------------------------------

export interface ILazyPluginLoader {
	/** Read the manifest for `id` without importing the module. */
	readManifest(id: string): Promise<IPluginManifest | undefined>;
	/** Lazy-import the module behind `id` and cache it. Idempotent:
	 *  concurrent callers share the same in-flight import. */
	load(id: string): Promise<ILoadedPluginEntry>;
	/** Pre-load a subset of plugins (e.g. the active preset). Best-
	 *  effort: failures are recorded, not thrown. */
	warmup(ids: readonly string[]): Promise<readonly IFailedPluginEntry[]>;
	/** State for one plugin (`unloaded` when the manifest is unknown). */
	state(id: string): PluginLoadState;
	/** Snapshot of the in-memory cache. Failed entries are reported
	 *  separately so dashboards can surface the first-load error. */
	snapshot(): {
		readonly loaded: readonly ILoadedPluginEntry[];
		readonly failed: readonly IFailedPluginEntry[];
	};
	/** Discard a plugin from the cache + call its `dispose()` (if any).
	 *  After `unload`, the next `load(id)` will re-import. */
	unload(id: string): Promise<boolean>;
	/** Cumulative bytes-equivalent: number of imports avoided at boot
	 *  thanks to laziness. (Counter, not bytes — the unit is a
	 *  manifest-only read.) */
	stats(): {
		readonly manifestsRead: number;
		readonly modulesImported: number;
		/** Wall-clock milliseconds saved at boot time = sum of
		 *  first-load times for plugins NOT yet used by the session.
		 *  (Boots are faster when fewer plugins are actually needed.) */
		readonly firstLoadTotalMs: number;
	};
	/** Reset every counter and drop every cache entry. */
	reset(): void;
}

/** Host-supplied dynamic-import wrapper. Mirrors the `import:` field
 *  in `ILoadPluginsOptions`. The host passes its `nodeDynamicImport`
 *  for CLI/runtime; tests pass a fake. */
export type PluginModuleImporter = (specifier: string) => Promise<unknown>;

export interface ILazyPluginLoaderOptions {
	/** Resolve the module specifier for `id`. Returned string is
	 *  passed to `import()`. Examples:
	 *   - `id = "git"` → `@delendai/git`
	 *   - `id = "@scope/foo"` → `@scope/foo`
	 *   - `id = "./plugins/bar"` → `./plugins/bar` (relative)
	 */
	resolveSpecifier: (id: string) => string;
	/** Validate a freshly imported module is an `IMcpPlugin`. */
	asPlugin: (mod: unknown) => IMcpPlugin | undefined;
	/** Manifest provider. The default reads `plugin.json` from the
	 *  workspace; tests pass a literal map. */
	readManifest?: IManifestProvider;
	/** Host-supplied dynamic importer. Required. */
	import: PluginModuleImporter;
	/** Per-import timeout (ms). Default 15000 — same as `load-plugins.ts`. */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const withTimeout = async <T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${ms}ms`)),
			ms,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};

export const createLazyPluginLoader = (
	options: ILazyPluginLoaderOptions,
): ILazyPluginLoader => {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	// Promises-in-flight are shared so two concurrent `load(id)` calls
	// do not double-import.
	const inflight = new Map<string, Promise<ILoadedPluginEntry>>();
	const loaded = new Map<string, ILoadedPluginEntry>();
	const failed = new Map<string, IFailedPluginEntry>();
	const manifestsRead = new Map<string, IPluginManifest>();

	let modulesImported = 0;
	let firstLoadTotalMs = 0;

	const readOneManifest = async (
		id: string,
	): Promise<IPluginManifest | undefined> => {
		const hit = manifestsRead.get(id);
		if (hit !== undefined) return hit;
		const provider = options.readManifest;
		if (provider === undefined) return undefined;
		const m = await provider(id);
		if (m !== undefined) manifestsRead.set(id, m);
		return m;
	};

	const importAndValidate = async (id: string): Promise<IMcpPlugin> => {
		const specifier = options.resolveSpecifier(id);
		const mod = await withTimeout(
			options.import(specifier),
			timeoutMs,
			`plugin "${id}" import`,
		);
		const plugin = options.asPlugin(mod);
		if (plugin === undefined) {
			throw new Error(
				`plugin "${id}" (${specifier}) did not export a valid IMcpPlugin`,
			);
		}
		return plugin;
	};

	const performLoad = async (id: string): Promise<ILoadedPluginEntry> => {
		const existing = loaded.get(id);
		if (existing !== undefined) return existing;
		const manifest = await readOneManifest(id);
		if (manifest === undefined) {
			throw new Error(`plugin "${id}" has no manifest; cannot lazy-load`);
		}
		const startedAt = Date.now();
		modulesImported += 1;
		try {
			const plugin = await importAndValidate(id);
			const firstLoadMs = Date.now() - startedAt;
			firstLoadTotalMs += firstLoadMs;
			const entry: ILoadedPluginEntry = {
				id,
				manifest,
				plugin,
				firstLoadMs,
				loadedAt: Date.now(),
			};
			loaded.set(id, entry);
			failed.delete(id);
			return entry;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			const prev = failed.get(id);
			failed.set(id, {
				id,
				manifest,
				error,
				failedAt: Date.now(),
				attemptCount: (prev?.attemptCount ?? 0) + 1,
			});
			throw error;
		}
	};

	return {
		async readManifest(id) {
			return readOneManifest(id);
		},
		load(id) {
			const inflightHit = inflight.get(id);
			if (inflightHit !== undefined) return inflightHit;
			const promise = performLoad(id).finally(() => {
				inflight.delete(id);
			});
			inflight.set(id, promise);
			return promise;
		},
		async warmup(ids) {
			const failures: IFailedPluginEntry[] = [];
			await Promise.all(
				ids.map(async (id) => {
					try {
						await this.load(id);
					} catch {
						const f = failed.get(id);
						if (f !== undefined) failures.push(f);
					}
				}),
			);
			return failures;
		},
		state(id) {
			if (loaded.has(id)) return 'loaded';
			if (inflight.has(id)) return 'pending';
			if (failed.has(id)) return 'failed';
			return 'unloaded';
		},
		snapshot() {
			return {
				loaded: [...loaded.values()],
				failed: [...failed.values()],
			};
		},
		async unload(id) {
			const entry = loaded.get(id);
			if (entry === undefined) return false;
			// The lazy loader only owns the module-import cache.
			// Plugin-level lifecycle (prepare/activate/dispose) is
			// the responsibility of `load-plugins-lifecycle.helper.ts`,
			// which holds the runtime. Here we just drop our cache
			// entry so the next `load(id)` triggers a fresh import.
			loaded.delete(id);
			failed.delete(id);
			return true;
		},
		stats() {
			return {
				manifestsRead: manifestsRead.size,
				modulesImported,
				firstLoadTotalMs,
			};
		},
		reset() {
			inflight.clear();
			loaded.clear();
			failed.clear();
			manifestsRead.clear();
			modulesImported = 0;
			firstLoadTotalMs = 0;
		},
	};
};
