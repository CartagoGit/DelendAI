/**
 * f00120 S4 — wiring-doctor façade.
 *
 * Pure over an injected `IPluginWiringFs`. The CLI script
 * (`tools/scripts/verify/plugin-wiring.script.ts`) injects the real fs;
 * tests inject a `Map`-backed in-memory one. The doctor and the writer
 * share the `IPluginWiringFs` interface so a writer + doctor pair are
 * guaranteed to agree on what "wired" means.
 */
import type {
	IPluginWiringFs,
	IPluginWiringPoint,
	IPluginWiringReport,
} from '../contracts/interfaces/plugin-wiring.interface';

const TSCONFIG_PATHS = 'tsconfig.base.json';
const VITEST_SHARED = 'vitest.shared.ts';
const PLUGIN_DEFAULTS_FILE = 'packages/core/src/lib/plugins/plugin-defaults.ts';
const RELEASE_PLAN_FILE = 'tools/scripts/release/release-plan.ts';
const PRESET_CATALOG_FILE = 'packages/core/src/lib/plugins/preset-catalog.ts';
const CATALOG_ARTIFACT = 'docs/mcp-vertex/agent-catalog.generated.json';
const HOST_CONFIG_FILE = 'mcp-vertex.config.json';

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const checkTsconfigBase = async (
	fs: IPluginWiringFs,
	pluginId: string,
): Promise<IPluginWiringPoint> => {
	const text = await fs.readFile(TSCONFIG_PATHS);
	const scoped = `@mcp-vertex/${pluginId}`;
	const ok =
		text.includes(`"${scoped}":`) &&
		text.includes(`"${scoped}/public":`) &&
		text.includes(`"${scoped}/*":`);
	return {
		id: 'tsconfig-base',
		path: TSCONFIG_PATHS,
		wired: ok,
		summary: `tsconfig.base.json compilerOptions.paths entries for "${scoped}"`,
		...(ok
			? {}
			: {
					remediation: `Add paths entries for "${scoped}", "${scoped}/public", "${scoped}/*" pointing under plugins/${pluginId}/src.`,
				}),
	};
};

const checkVitestShared = async (
	fs: IPluginWiringFs,
	pluginId: string,
): Promise<IPluginWiringPoint> => {
	const text = await fs.readFile(VITEST_SHARED);
	const scoped = `@mcp-vertex/${pluginId}`;
	// The real shape (audit 2026-07-24): every plugin emits exactly two
	// `find:` entries — `find: '@mcp-vertex/<id>'` and
	// `find: '@mcp-vertex/<id>/public'`. The optional `lib/` wildcard is
	// only added by plugins that ALSO ship a regex-capture alias in the
	// writer, but the workspace currently has no plugin using that shape,
	// so the regex check was a phantom assertion that flagged every plugin
	// as unwired. The two literal `find:` entries are the actual contract.
	const ok =
		text.includes(`find: '${scoped}'`) &&
		text.includes(`find: '${scoped}/public'`);
	return {
		id: 'vitest-shared',
		path: VITEST_SHARED,
		wired: ok,
		summary: `vitest.shared.ts workspaceAliases for "${scoped}"`,
		...(ok
			? {}
			: {
					remediation: `Add a const declaration + two alias entries to workspaceAliases() in vitest.shared.ts (find: '@mcp-vertex/<id>' and find: '@mcp-vertex/<id>/public').`,
				}),
	};
};

/** Inline stubs that mirror `PLUGIN_DEFAULTS` + `PRESET_CATALOG` +
 * `PUBLISH_ORDER` so the doctor stays usable without dragging the live
 * core data in. The CLI script passes the live values. */

const checkPluginDefaultsFromText = (
	text: string,
	pluginId: string,
): IPluginWiringPoint => {
	const ok = new RegExp(
		`(?:'|")?${escapeRegex(pluginId)}(?:'|")?\\s*:\\s*\\{`,
		'u',
	).test(text);
	return {
		id: 'plugin-defaults',
		path: PLUGIN_DEFAULTS_FILE,
		wired: ok,
		summary: `PLUGIN_DEFAULTS entry for "${pluginId}"`,
		...(ok
			? {}
			: {
					remediation: `Add a "${pluginId}": {} entry to PLUGIN_DEFAULTS in packages/core/src/lib/plugins/plugin-defaults.ts.`,
				}),
	};
};

const checkPublishOrderFromText = (
	text: string,
	pluginId: string,
): IPluginWiringPoint => {
	const dir = `plugins/${pluginId}`;
	const ok = new RegExp(`'${escapeRegex(dir)}'`, 'u').test(text);
	return {
		id: 'publish-order',
		path: RELEASE_PLAN_FILE,
		wired: ok,
		summary: `PUBLISH_ORDER entry for "${dir}"`,
		...(ok
			? {}
			: {
					remediation: `Add '${dir}' to PUBLISH_ORDER in tools/scripts/release/release-plan.ts.`,
				}),
	};
};

const checkPresetCatalogFromText = (
	text: string,
	pluginId: string,
): IPluginWiringPoint => {
	const ok = new RegExp(`plugin:\\s*'${escapeRegex(pluginId)}'`, 'u').test(
		text,
	);
	return {
		id: 'preset-catalog',
		path: PRESET_CATALOG_FILE,
		wired: ok,
		summary: `PRESET_CATALOG membership for "${pluginId}"`,
		...(ok
			? {}
			: {
					remediation: `Add a { plugin: '${pluginId}' } entry to one of the presets in packages/core/src/lib/plugins/preset-catalog.ts.`,
				}),
	};
};

const checkCatalogRegenFromText = (
	text: string,
	pluginId: string,
): IPluginWiringPoint => {
	const ok = new RegExp(`"plugin":\\s*"${escapeRegex(pluginId)}"`, 'u').test(
		text,
	);
	return {
		id: 'catalog-regen',
		path: CATALOG_ARTIFACT,
		wired: ok,
		summary: `agent catalog lists tools from "${pluginId}"`,
		...(ok
			? {}
			: {
					remediation: `Run \`bun run catalog:generate\` so the agent catalog picks up the new plugin.`,
				}),
	};
};

const isPluginLoadedByHost = (
	hostConfigText: string,
	pluginId: string,
): boolean => {
	// The host config is JSON; the plugin list lives under `plugins.<id>`.
	// We do a tolerant substring probe so the doctor doesn't choke on
	// trailing commas, comments, or 4-space indents.
	const probe = new RegExp(
		`"plugins"\\s*:\\s*\\{[\\s\\S]*?"${escapeRegex(pluginId)}"\\s*:`,
		'u',
	);
	return probe.test(hostConfigText);
};

/**
 * Run every checker for one plugin id and produce a verdict. The doctor
 * reads the three source files it owns (`tsconfig.base.json`,
 * `vitest.shared.ts`, the three core files) and the agent catalog.
 *
 * The catalog-regen check is **skipped** when the plugin is not in
 * `mcp-vertex.config.json` (opt-in plugins like `web-fetch` or `audit`
 * are not loaded by the host by default; the catalog reflects what the
 * host loads). For an opt-in plugin, the catalog not listing it is the
 * correct state.
 */
export const diagnosePluginWiring = async (
	pluginId: string,
	fs: IPluginWiringFs,
): Promise<IPluginWiringReport> => {
	const [
		pluginDefaultsText,
		releasePlanText,
		presetCatalogText,
		catalogText,
	] = await Promise.all([
		fs.readFile(PLUGIN_DEFAULTS_FILE),
		fs.readFile(RELEASE_PLAN_FILE),
		fs.readFile(PRESET_CATALOG_FILE),
		fs.readFile(CATALOG_ARTIFACT),
	]);
	// The catalog-regen check is **only** skipped when the host config
	// explicitly opts the plugin out (the plugin is registered as a
	// first-class plugin but not loaded — opt-in by the host). When
	// the host config is absent (adopter repo, fresh plugin dir before
	// `init`) every point is checked, including catalog-regen, because
	// `create_plugin` is meant to leave a half-wired plugin only when
	// `dryRun: true` is set.
	const hostExists = await fs.pathExists(HOST_CONFIG_FILE);
	const isOptIn = hostExists
		? !isPluginLoadedByHost(await fs.readFile(HOST_CONFIG_FILE), pluginId)
		: false;
	const points: IPluginWiringPoint[] = [
		await checkTsconfigBase(fs, pluginId),
		await checkVitestShared(fs, pluginId),
		checkPluginDefaultsFromText(pluginDefaultsText, pluginId),
		checkPublishOrderFromText(releasePlanText, pluginId),
		checkPresetCatalogFromText(presetCatalogText, pluginId),
		isOptIn
			? {
					id: 'catalog-regen' as const,
					path: CATALOG_ARTIFACT,
					wired: true,
					summary: `agent catalog lists tools from "${pluginId}" (skipped — opt-in plugin not in ${HOST_CONFIG_FILE})`,
				}
			: checkCatalogRegenFromText(catalogText, pluginId),
	];
	const missing = points
		.filter((point) => !point.wired)
		.map((point) => point.id);
	return {
		pluginId,
		points,
		fullyWired: missing.length === 0,
		missing,
	};
};
