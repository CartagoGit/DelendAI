import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import type { IPluginRegisterErrorInfo } from '../contracts/interfaces/plugin-lifecycle-error.interface';
import {
	checkPluginDependencies,
	formatMissingDependenciesError,
} from './load-plugins-deps.helper';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const fileExists = async (path: string): Promise<boolean> => {
	try {
		const fs = await import('node:fs/promises');
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
};

export interface ILoadedPlugin {
	/** The specifier the user passed (`--plugins=<this>`). */
	readonly specifier: string;
	/** The module specifier that actually resolved. */
	readonly resolved: string;
	readonly plugin: IMcpPlugin;
	readonly registrations: IMcpPluginRegistrations;
}

export interface IPluginLoadResult {
	readonly loaded: readonly ILoadedPlugin[];
	readonly errors: ReadonlyArray<{
		readonly specifier: string;
		readonly message: string;
	}>;
	readonly registerErrors: readonly IPluginRegisterErrorInfo[];
}

export interface ILoadPluginsOptions {
	readonly specifiers: readonly string[];
	/** Absolute workspace root used to resolve relative plugin paths. */
	readonly workspaceRoot?: string | undefined;
	/** Build the per-plugin context once the plugin's name is known. */
	readonly buildContext: (
		pluginName: string,
		cacheNamespace?: string,
	) => IMcpPluginContext;
	/**
	 * Injectable importer. **Required** — the core never calls
	 * `import(variable)` itself, so that Vite/Rollup can statically
	 * analyse the bundle that ships in browser hosts (the web app and
	 * the VS Code extension) without an "unanalysable dynamic import"
	 * warning. CLI callers pass `nodeDynamicImport` from this package;
	 * tests pass a fake.
	 */
	readonly import: (specifier: string) => Promise<unknown>;
	/** Per-step timeout (ms) for import and register. Default 15000. */
	readonly timeoutMs?: number;
}

/**
 * Node-side dynamic import, suitable for CLI/runtime hosts.
 *
 * Built via `new Function(...)` so the literal `import(specifier)`
 * source is never visible to a static analyser (Vite warns about
 * unresolvable dynamic imports and downgrades tree-shaking). At
 * runtime this is exactly equivalent to `import(specifier)`.
 *
 * Some test sandboxes (e.g. vitest under bun) reject dynamic imports
 * synthesized via `new Function` ("A dynamic import callback was not
 * specified"). When that happens we fall back to a direct `import()`
 * which is also unresolvable from the bundler's perspective but
 * works at runtime in those sandboxes. Both code paths converge on
 * the same call site; the fallback exists purely to make the function
 * usable under test.
 *
 * Exported separately so it never lives inside the core's public
 * bundle — browser hosts (web, VS Code) MUST provide their own
 * loader instead. The web app's loader is a thin wrapper around the
 * module-graph URL the dev server hands it; the VS Code extension
 * uses Node's `require` for activation-time loads.
 */
export const nodeDynamicImport = async (
	specifier: string,
): Promise<unknown> => {
	const normalized = normalizeImportSpecifier(specifier);
	// Use `Function` to hide `import()` from the static analyser, but
	// fall back to the direct form on sandbox failures so callers
	// (and the test suite) keep working in restricted runtimes.
	const indirect = new Function('specifier', 'return import(specifier);') as (
		s: string,
	) => Promise<unknown>;
	try {
		return await indirect(normalized);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/dynamic import callback/i.test(message)) {
			return await import(normalized);
		}
		throw err;
	}
};

const normalizeImportSpecifier = (specifier: string): string => {
	if (!specifier.startsWith('/')) return specifier;
	return pathToFileURL(specifier).href;
};

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

/**
 * Turn a short plugin name into the module specifiers to try, in
 * order. A relative/absolute path or an explicit package path is used
 * verbatim; a bare short name (`proposals`) expands to the scoped
 * convention first (`@mcp-vertex/proposals`), then the bare name.
 */
export const resolvePluginSpecifier = (specifier: string): string[] => {
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('file:')
	) {
		return [specifier];
	}
	if (specifier.includes('/')) return [specifier];
	return [`@mcp-vertex/${specifier}`, `mcp-${specifier}`, specifier];
};

const isPathLikeSpecifier = (specifier: string): boolean =>
	specifier.startsWith('.') ||
	specifier.startsWith('/') ||
	specifier.startsWith('file:');

const resolveFilesystemSpecifier = (
	specifier: string,
	workspaceRoot: string | undefined,
): string => {
	if (!specifier.startsWith('.')) return specifier;
	if (workspaceRoot === undefined || workspaceRoot.length === 0) {
		return specifier;
	}
	return resolvePath(workspaceRoot, specifier);
};

const asPlugin = (mod: unknown): IMcpPlugin | undefined => {
	const candidate =
		mod && typeof mod === 'object' && 'default' in mod
			? (mod as { default: unknown }).default
			: mod;
	const value =
		typeof candidate === 'function'
			? (candidate as () => unknown)()
			: candidate;
	if (
		value &&
		typeof value === 'object' &&
		typeof (value as IMcpPlugin).name === 'string' &&
		typeof (value as IMcpPlugin).register === 'function'
	) {
		return value as IMcpPlugin;
	}
	return undefined;
};

/** A plugin that resolved + validated its options but has NOT yet run `register()`. */
interface IResolvedPlugin {
	readonly specifier: string;
	readonly resolved: string;
	readonly plugin: IMcpPlugin;
	readonly ctx: IMcpPluginContext;
}

/**
 * Resolve, import and register each requested plugin. One bad plugin
 * never aborts the rest: failures are collected in `errors` and the
 * server still boots with whatever loaded. Deterministic: plugins are
 * processed in the order requested.
 *
 * Two-phase by design (a00065 S6):
 *  1. **Resolve** — import, dedup, and validate options for every
 *     specifier WITHOUT calling `register()`. No plugin side effects
 *     run yet.
 *  2. **Dependency gate** — `checkPluginDependencies` runs over the
 *     RESOLVED set. If any plugin declares a `dependsOn` not satisfied
 *     by the rest of the set, the WHOLE batch is refused: `loaded`
 *     comes back empty and a single combined error lists every missing
 *     dependency. Because this runs *before* phase 3, a plugin with an
 *     unmet hard dependency never executes its `register()` side
 *     effects (timers, sockets, file writes) — the previous order ran
 *     every register() first and only rejected afterwards, leaking
 *     those effects.
 *  3. **Register** — only once dependencies are satisfied, call each
 *     resolved plugin's `register()` in request order. A register()
 *     that throws is collected in `errors` without aborting the rest.
 */
export const loadPlugins = async (
	options: ILoadPluginsOptions,
): Promise<IPluginLoadResult> => {
	const importer = options.import;
	const timeoutMs = options.timeoutMs ?? 15_000;
	const errors: Array<{ specifier: string; message: string }> = [];
	const registerErrors: IPluginRegisterErrorInfo[] = [];
	const resolvedPlugins: IResolvedPlugin[] = [];
	const resolvedNames = new Set<string>();
	const seenSpecifiers = new Set<string>();

	// ── Phase 1: resolve + validate options (no register() side effects). ──
	for (const specifier of options.specifiers) {
		// Dedup identical specifiers up front (e.g. `--plugins=memory,memory`).
		if (seenSpecifiers.has(specifier)) {
			errors.push({
				specifier,
				message: `duplicate plugin specifier "${specifier}" ignored.`,
			});
			continue;
		}
		seenSpecifiers.add(specifier);
		const normalizedSpecifier = resolveFilesystemSpecifier(
			specifier,
			options.workspaceRoot,
		);
		const candidates = resolvePluginSpecifier(normalizedSpecifier);
		let plugin: IMcpPlugin | undefined;
		let resolved = '';
		const attemptErrors: string[] = [];
		for (const candidate of candidates) {
			try {
				const mod = await withTimeout(
					Promise.resolve(importer(candidate)),
					timeoutMs,
					`import("${candidate}")`,
				);
				const found = asPlugin(mod);
				if (found) {
					plugin = found;
					resolved = candidate;
					break;
				}
				attemptErrors.push(
					`${candidate}: no default IMcpPlugin export`,
				);
			} catch (error) {
				attemptErrors.push(
					`${candidate}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		if (!plugin) {
			if (
				isPathLikeSpecifier(normalizedSpecifier) &&
				normalizedSpecifier.startsWith('/') &&
				!(await fileExists(normalizedSpecifier))
			) {
				errors.push({
					specifier,
					message: `plugin path does not exist: ${normalizedSpecifier}`,
				});
				continue;
			}
			errors.push({
				specifier,
				message: `could not load plugin "${specifier}" (tried ${candidates.join(', ')}). ${attemptErrors.join('; ')}`,
			});
			continue;
		}
		// Dedup by resolved plugin name (two specifiers → same plugin).
		if (resolvedNames.has(plugin.name)) {
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" already loaded (duplicate ignored).`,
			});
			continue;
		}
		let ctx: IMcpPluginContext;
		try {
			ctx = options.buildContext(plugin.name, plugin.cacheNamespace);
		} catch (error) {
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" context build failed: ${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}
		if (plugin.optionsSchema) {
			const parsed = plugin.optionsSchema.safeParse(ctx.options);
			if (!parsed.success) {
				errors.push({
					specifier,
					message: `plugin "${plugin.name}" rejected its options (mcp-vertex.config.json → plugins.${plugin.name}.options).`,
				});
				continue;
			}
		}
		resolvedPlugins.push({ specifier, resolved, plugin, ctx });
		resolvedNames.add(plugin.name);
	}

	// ── Phase 2: dependency gate — refuse the whole batch BEFORE any
	//    register() runs if a hard dependency is unmet. ──
	const missingDependencies = checkPluginDependencies(resolvedPlugins);
	if (missingDependencies.length > 0) {
		for (const missing of missingDependencies) {
			const resolved = resolvedPlugins.find(
				(entry) => entry.plugin.name === missing.plugin,
			);
			registerErrors.push({
				pluginName: missing.plugin,
				resolvedSpecifier: resolved?.resolved ?? missing.plugin,
				phase: 'dependency',
				error: new Error(
					`plugin "${missing.plugin}" requires ${missing.missing.join(', ')}`,
				),
				missingDependencies: missing.missing,
			});
		}
		return {
			loaded: [],
			errors: [
				...errors,
				{
					specifier: '(dependsOn)',
					message:
						formatMissingDependenciesError(missingDependencies),
				},
			],
			registerErrors,
		};
	}

	// ── Phase 3: register (side effects) — dependencies are satisfied. ──
	const loaded: ILoadedPlugin[] = [];
	for (const { specifier, resolved, plugin, ctx } of resolvedPlugins) {
		try {
			const registrations = await withTimeout(
				Promise.resolve(plugin.register(ctx)),
				timeoutMs,
				`plugin "${plugin.name}" register()`,
			);
			loaded.push({ specifier, resolved, plugin, registrations });
		} catch (error) {
			registerErrors.push({
				pluginName: plugin.name,
				resolvedSpecifier: resolved,
				phase: 'register',
				error,
			});
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" register() failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}

	return { loaded, errors, registerErrors };
};
