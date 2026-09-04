/**
 * plugin-add.ts — f00141 S2: pure orchestrator for `plugin_add`.
 *
 * Given a plugin id (must be in `FIRST_PARTY_PLUGIN_INDEX` or a
 * community source the caller passes in), produce the recipe the
 * caller (MCP tool or CLI) executes:
 *   1. install the package (`npm install <package>` or `bun add`);
 *   2. wire the six monorepo points (tsconfig, vitest, plugin-defaults,
 *      preset-catalog, publish-order, regenerated tool-outputs);
 *   3. add the plugin to the user's `delendai.config.json`.
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
	/**
	 * x00161 S1 — true only when the caller IS the `@delendai/core`
	 * monorepo adding a new first-party plugin to itself (tsconfig
	 * project references, the shared vitest workspace, the preset
	 * catalog, the publish order, the regenerated tool-outputs SDK).
	 * Defaults to `false`: an external adopter project that merely
	 * depends on `@delendai/core` as an npm package has none of
	 * those six touchpoints, and the "wire" step must not describe
	 * work that does not apply there.
	 */
	readonly monorepoDev?: boolean;
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
	const monorepoDev = options.monorepoDev ?? false;
	const steps: IPluginAddStep[] = [
		{
			kind: 'install',
			summary: `Install npm package "${entry.package}" into the workspace.`,
			detail: { package: entry.package, id: entry.id },
		},
		{
			kind: 'wire',
			summary: monorepoDev
				? `Wire "${entry.id}" into the six monorepo points (tsconfig, vitest, plugin-defaults, preset-catalog, publish-order, regenerated tool-outputs).`
				: `Enable "${entry.id}" for this project: add it to the host's plugin/preset load list (e.g. delendai.config.json or the host's --plugins flag) so the server actually loads it. No monorepo-only wiring applies here — this project consumes "${entry.package}" as a published dependency, not as source inside the @delendai/core monorepo.`,
			detail: { id: entry.id, preset: entry.defaultPreset ?? 'manual' },
		},
		{
			kind: 'config',
			summary: `Add "plugins.${entry.id}.options" to delendai.config.json.`,
			detail: { id: entry.id, key: `plugins.${entry.id}` },
		},
	];
	return { entry, steps, alreadyAdopted };
};
