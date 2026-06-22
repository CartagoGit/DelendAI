import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';

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
}

/** One loaded plugin's unmet `dependsOn` entries. */
export interface IMissingPluginDependency {
	readonly plugin: string;
	readonly missing: readonly string[];
}

export interface ILoadPluginsOptions {
	readonly specifiers: readonly string[];
	/** Build the per-plugin context once the plugin's name is known. */
	readonly buildContext: (pluginName: string) => IMcpPluginContext;
	/** Injectable importer (default: dynamic `import`). For tests. */
	readonly import?: (specifier: string) => Promise<unknown>;
	/** Per-step timeout (ms) for import and register. Default 15000. */
	readonly timeoutMs?: number;
}

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

/**
 * Pure, single-pass dependency check: for every loaded plugin whose
 * `dependsOn` names a plugin id that is NOT also in the loaded set,
 * collect a `{ plugin, missing }` entry. Order matches `loadedPlugins`.
 * Does not mutate or import anything — a separate concern from the
 * import/register loop in `loadPlugins`, so it can be unit-tested and
 * reasoned about on its own (SOLID: one responsibility per function).
 */
export const checkPluginDependencies = (
	loadedPlugins: readonly ILoadedPlugin[],
): readonly IMissingPluginDependency[] => {
	const loadedNames = new Set(
		loadedPlugins.map((entry) => entry.plugin.name),
	);
	const result: IMissingPluginDependency[] = [];
	for (const { plugin } of loadedPlugins) {
		const missing = (plugin.dependsOn ?? []).filter(
			(dep) => !loadedNames.has(dep),
		);
		if (missing.length > 0) {
			result.push({ plugin: plugin.name, missing });
		}
	}
	return result;
};

/** Render the combined dependency error for every plugin with missing deps. */
const formatMissingDependenciesError = (
	missing: readonly IMissingPluginDependency[],
): string =>
	missing
		.map(
			(entry) =>
				`plugin "${entry.plugin}" requires ${entry.missing
					.map((dep) => `"${dep}"`)
					.join(', ')} (not in load set)`,
		)
		.join('; ');

/**
 * Resolve, import and register each requested plugin. One bad plugin
 * never aborts the rest: failures are collected in `errors` and the
 * server still boots with whatever loaded. Deterministic: plugins are
 * processed in the order requested.
 *
 * After every plugin has attempted to load, a final dependency pass
 * (`checkPluginDependencies`) runs over the loaded set. If any loaded
 * plugin declares a `dependsOn` that is not satisfied by the rest of
 * the load set, the WHOLE batch is refused — `loaded` comes back empty
 * and a single combined error lists every missing dependency. This is
 * deliberately stricter than the per-plugin error handling above: a
 * plugin with an unmet hard dependency must never partially register.
 */
export const loadPlugins = async (
	options: ILoadPluginsOptions,
): Promise<IPluginLoadResult> => {
	const importer =
		options.import ?? ((specifier: string) => import(specifier));
	const timeoutMs = options.timeoutMs ?? 15_000;
	const loaded: ILoadedPlugin[] = [];
	const errors: Array<{ specifier: string; message: string }> = [];
	const loadedNames = new Set<string>();
	const seenSpecifiers = new Set<string>();

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
		const candidates = resolvePluginSpecifier(specifier);
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
			errors.push({
				specifier,
				message: `could not load plugin "${specifier}" (tried ${candidates.join(', ')}). ${attemptErrors.join('; ')}`,
			});
			continue;
		}
		// Dedup by resolved plugin name (two specifiers → same plugin).
		if (loadedNames.has(plugin.name)) {
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" already loaded (duplicate ignored).`,
			});
			continue;
		}
		try {
			const ctx = options.buildContext(plugin.name);
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
			const registrations = await withTimeout(
				Promise.resolve(plugin.register(ctx)),
				timeoutMs,
				`plugin "${plugin.name}" register()`,
			);
			loaded.push({ specifier, resolved, plugin, registrations });
			loadedNames.add(plugin.name);
		} catch (error) {
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" register() failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}

	const missingDependencies = checkPluginDependencies(loaded);
	if (missingDependencies.length > 0) {
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
		};
	}

	return { loaded, errors };
};
