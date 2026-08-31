import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import type { IPluginRegisterErrorInfo } from '../contracts/interfaces/plugin-lifecycle-error.interface';
import { registerResolvedPluginsWithLifecycle } from './load-plugins-lifecycle.helper';
import { normalizePluginOptions } from './plugin-activation-session';
import { validatePluginConfiguration } from './configuration-compatibility';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootstrapCacheLayout } from '../cache/cache-layout-bootstrap';
import { resolveWorkspaceContained } from '../shared/contain-path';
import { basename } from 'node:path';

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
	readonly runtime: IPluginRuntime<IMcpPluginRegistrations>;
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
	/** External batch cancellation for register lifecycle. */
	readonly signal?: AbortSignal | undefined;
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
	workspaceRoot?: string,
): Promise<unknown> => {
	const localSource =
		workspaceRoot !== undefined && specifier.startsWith('@mcp-vertex/')
			? await resolveLocalFirstPartySource(specifier, workspaceRoot)
			: undefined;
	const runtimeSpecifier = localSource ?? specifier;
	const normalized = normalizeImportSpecifier(runtimeSpecifier);
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
			try {
				return await import(normalized);
			} catch (fallbackError) {
				if (localSource === undefined && workspaceRoot !== undefined) {
					const packageId = specifier.slice('@mcp-vertex/'.length);
					const expectedPaths = [
						join(
							workspaceRoot,
							'packages',
							packageId,
							'src',
							'index.ts',
						),
						join(
							workspaceRoot,
							'plugins',
							packageId,
							'src',
							'index.ts',
						),
					];
					const fallbackMessage =
						fallbackError instanceof Error
							? fallbackError.message
							: String(fallbackError);
					throw new Error(
						`local first-party plugin source not found for "${specifier}" under "${workspaceRoot}"; expected src/index.ts. Package resolution also failed: ${fallbackMessage}. Checked: ${expectedPaths.join(', ')}`,
					);
				}
				throw fallbackError;
			}
		}
		if (localSource === undefined && workspaceRoot !== undefined) {
			const packageId = specifier.slice('@mcp-vertex/'.length);
			const expectedPaths = [
				join(workspaceRoot, 'packages', packageId, 'src', 'index.ts'),
				join(workspaceRoot, 'plugins', packageId, 'src', 'index.ts'),
			];
			throw new Error(
				`local first-party plugin source not found for "${specifier}" under "${workspaceRoot}"; expected src/index.ts. Package resolution also failed: ${message}. Checked: ${expectedPaths.join(', ')}`,
			);
		}
		throw err;
	}
};

const resolveLocalFirstPartySource = async (
	specifier: string,
	workspaceRoot: string,
): Promise<string | undefined> => {
	const packageId = specifier.slice('@mcp-vertex/'.length);
	if (packageId.includes('/')) return specifier;
	const candidates = [
		join(workspaceRoot, 'packages', packageId, 'src', 'index.ts'),
		join(workspaceRoot, 'plugins', packageId, 'src', 'index.ts'),
	];
	for (const candidate of candidates) {
		if (await fileExists(candidate)) return candidate;
	}
	return undefined;
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
	specifier.startsWith('file:') ||
	specifier.startsWith('plugins/') ||
	specifier.startsWith('packages/');

const resolveFilesystemSpecifier = (
	specifier: string,
	workspaceRoot: string | undefined,
): string => {
	if (
		!specifier.startsWith('.') &&
		!specifier.startsWith('plugins/') &&
		!specifier.startsWith('packages/')
	)
		return specifier;
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
	ctx: IMcpPluginContext;
}

/**
 * Resolve, import and register each requested plugin. Import and option
 * validation keep the old tolerant behaviour (one bad specifier does not
 * abort the rest). The register phase is transactional: once registration
 * starts, the first register failure or cancellation rolls back the plugins
 * that already became active, in reverse order.
 *
 * Three-phase by design (a00065 S6, x00218):
 *  1. **Resolve** — import, dedup, and validate options for every
 *     specifier WITHOUT calling `register()`. No plugin side effects
 *     run yet.
 *  2. **Dependency graph** — build the DAG from the resolved set,
 *     detect cycles before side effects, and mark nodes blocked when a
 *     hard dependency is missing.
 *  3. **Register** — register in topological order. A plugin whose
 *     dependency failed or is blocked never runs `register()`; it is
 *     marked blocked and reported through `errors` + `registerErrors`.
 */
export const loadPlugins = async (
	options: ILoadPluginsOptions,
): Promise<IPluginLoadResult> => {
	const importer = options.import;
	const timeoutMs = options.timeoutMs ?? 15_000;
	const errors: Array<{ specifier: string; message: string }> = [];
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
		// Delegates to the SAME normalizer the managed-lazy runtime uses
		// (`plugin-activation-session.ts`) so eager and lazy activation
		// can never re-diverge on how `optionsSchema` is applied (AUD-E01.a).
		const normalized = normalizePluginOptions(plugin, ctx);
		if (!normalized.ok) {
			errors.push({ specifier, message: normalized.message });
			continue;
		}
		ctx = normalized.ctx;
		resolvedPlugins.push({ specifier, resolved, plugin, ctx });
		resolvedNames.add(plugin.name);
	}

	// Cross-plugin configuration validation runs only after every selected
	// plugin has passed its own schema and before any register() side effect.
	// This makes incompatible policies a boot-time error, never a runtime race.
	const pluginOptions = new Map(
		resolvedPlugins.map(({ plugin, ctx }) => [plugin.name, ctx.options]),
	);
	const enabledPlugins = resolvedPlugins.map(({ plugin }) => plugin.name);
	const configurationIssues = await validatePluginConfiguration({
		plugins: resolvedPlugins.map(({ plugin }) => plugin),
		pluginOptions,
		enabledPlugins,
	});
	if (configurationIssues.length > 0) {
		for (const message of configurationIssues) {
			errors.push({
				specifier: 'configuration',
				message,
			});
		}
		return { loaded: [], errors, registerErrors: [] };
	}

	for (const entry of resolvedPlugins) {
		entry.ctx = { ...entry.ctx, pluginOptions };
	}

	for (const entry of resolvedPlugins) {
		const canonicalPluginDir = entry.ctx.pluginCacheDir;
		const legacyPaths = [
			...(entry.ctx.cacheDir !== DEFAULT_CORE_PATHS.cacheDir
				? [
						{
							source: `${DEFAULT_CORE_PATHS.cacheDir}/${entry.plugin.name}`,
							destination: '',
						},
					]
				: []),
			...(entry.plugin.legacyCachePaths ?? []),
		].flatMap((path) => {
			const source = resolveWorkspaceContained(
				entry.ctx.workspace.root,
				path.source,
			);
			const destinationRel =
				path.destination === undefined
					? basename(path.source)
					: path.destination;
			const destination = resolveWorkspaceContained(
				entry.ctx.workspace.root,
				join(canonicalPluginDir, destinationRel),
			);
			return source.ok && destination.ok
				? [
						{
							sourceAbs: source.abs,
							destinationAbs: destination.abs,
						},
					]
				: [];
		});
		if (legacyPaths.length === 0) continue;
		await bootstrapCacheLayout({
			workspaceRootAbs: entry.ctx.workspace.root,
			cacheDirAbs: entry.ctx.cacheDir,
			includeBuiltInLegacyPaths: false,
			createCacheDir: false,
			legacyPaths,
		});
	}

	const lifecycle = await registerResolvedPluginsWithLifecycle({
		resolvedPlugins,
		timeoutMs,
		signal: options.signal,
	});

	return {
		loaded: lifecycle.loaded,
		errors: [...errors, ...lifecycle.errors],
		registerErrors: lifecycle.registerErrors,
	};
};
