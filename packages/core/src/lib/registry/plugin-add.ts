/**
 * plugin-add.ts — f00141 S2: pure orchestrator for `plugin_add`.
 *
 * Given a plugin id (must be in `FIRST_PARTY_PLUGIN_INDEX` or a
 * community source the caller passes in), produce the recipe the
 * caller (MCP tool or CLI) executes:
 *   1. install the package (`npm install <package>` or `bun add`);
 *   2. wire the six monorepo points (tsconfig, vitest, plugin-defaults,
 *      preset-catalog, publish-order, regenerated tool-outputs);
 *   3. add the plugin to the user's `mcp-vertex.config.json`.
 *
 * The function is **pure** over its inputs: no fs, no subprocess.
 * Production callers inject an `IPluginAddRunner` that does the I/O;
 * tests pass a fake. The contract is the same as `runInstall` in
 * `packages/core/src/lib/install/installer.ts` — id + recipe, the
 * caller does the rest.
 *
 * Idempotent: re-running on a plugin that is already wired returns
 * `{ok:true, changed: false}` and re-emits the same recipe (so the
 * caller can short-circuit the npm step if it wants).
 */
import { FIRST_PARTY_PLUGIN_INDEX } from './first-party-index';
import { resolvePlugins } from './resolve';
import type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
} from '../contracts/interfaces/plugin-registry.interface';

export type PluginAddKind = 'install' | 'wire' | 'config';

export interface IPluginAddStep {
	/** One of: install the package, wire monorepo points, write config. */
	readonly kind: PluginAddKind;
	/** Human-readable one-liner for the step (echoed by the CLI). */
	readonly summary: string;
	/** Machine-readable detail (npm package, config key, wiring point, etc.). */
	readonly detail: Readonly<Record<string, unknown>>;
}

export interface IPluginAddRecipe {
	readonly entry: IPluginRegistryEntry;
	readonly steps: readonly IPluginAddStep[];
	/** True when the plugin already appears wired in the caller's view. */
	readonly alreadyAdopted: boolean;
}

export interface IPluginAddOptions {
	/** Inject extra sources (community) — defaults to the bundled index only. */
	readonly sources?: readonly IPluginRegistrySource[];
	/** Plugin ids that the caller already considers adopted. */
	readonly alreadyAdoptedIds?: readonly string[];
}

/** Build the recipe for adopting one plugin. */
export const buildPluginAddRecipe = (
	pluginId: string,
	options: IPluginAddOptions = {},
): IPluginAddRecipe | undefined => {
	const resolved = resolvePlugins({
		...(options.sources !== undefined ? { sources: options.sources } : {}),
		query: pluginId,
		limit: 5,
	});
	const entry =
		resolved.entries.find((candidate) => candidate.id === pluginId) ??
		FIRST_PARTY_PLUGIN_INDEX.entries.find(
			(candidate) => candidate.id === pluginId,
		);
	if (entry === undefined) return undefined;
	const alreadyAdopted =
		options.alreadyAdoptedIds?.includes(entry.id) ?? false;
	const steps: IPluginAddStep[] = [
		{
			kind: 'install',
			summary: `Install npm package "${entry.package}" into the workspace.`,
			detail: { package: entry.package, id: entry.id },
		},
		{
			kind: 'wire',
			summary: `Wire "${entry.id}" into the six monorepo points (tsconfig, vitest, plugin-defaults, preset-catalog, publish-order, regenerated tool-outputs).`,
			detail: { id: entry.id, preset: entry.defaultPreset ?? 'manual' },
		},
		{
			kind: 'config',
			summary: `Add "plugins.${entry.id}.options" to mcp-vertex.config.json.`,
			detail: { id: entry.id, key: `plugins.${entry.id}` },
		},
	];
	return { entry, steps, alreadyAdopted };
};
