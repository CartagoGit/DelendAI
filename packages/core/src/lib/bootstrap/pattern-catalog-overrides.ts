// pattern-catalog-overrides: let a host extend or replace entries in
// `PROJECT_PATTERN_CATALOG` without forking the core.
//
// Use case: a project that ships a custom project type (e.g.
// `data-pipeline` for an ETL repo) needs the bootstrap blueprint to
// pick up its tools, plugins and knowledge hints. The host declares
// the override in `mcp-vertex.config.json`:
//
// ```jsonc
// {
//   "bootstrap": {
//     "patternOverrides": {
//       "data-pipeline": {
//         "type": "data-pipeline",
//         "describe": "An ETL/data pipeline repo.",
//         "recommendedTools": [
//           { "name": "run_pipeline", "description": "..." }
//         ],
//         "recommendedPlugins": ["quality", "audit"],
//         "knowledgeHints": ["Pin data sources in the catalog."]
//       }
//     }
//   }
// }
// ```
//
// The override layer is purely additive: keys the host does not
// declare fall back to the hardcoded catalog. Keys the host DOES
// declare either replace the hardcoded entry (for built-in types) or
// extend the catalog with a brand-new type (for host-defined types).
//
// Validation is performed by the host at config-load time (Zod) —
// this module assumes the input already has the right shape.

import type { IProjectType } from './analyze-project';
import { PROJECT_PATTERN_CATALOG } from './pattern-catalog';
import type { IProjectPattern } from './pattern-catalog';

export type IPatternOverrides = Readonly<
	Record<string, IProjectPatternLoose | undefined>
>;

/**
 * Loose pattern shape used at the host/config boundary. Hosts that
 * declare `bootstrap.patternOverrides` write strings for the project
 * type (since the config can't import the `IProjectType` enum); the
 * merger in `resolvePatternCatalog` widens/narrows the type as needed.
 * Kept distinct from `IProjectPattern` so a typo in a config file
 * does not propagate a `string` into a `Record<IProjectType, …>`.
 */
export interface IProjectPatternLoose {
	readonly type: string;
	readonly describe: string;
	readonly recommendedTools: ReadonlyArray<{
		readonly name: string;
		readonly description: string;
	}>;
	readonly recommendedPlugins: readonly string[];
	readonly knowledgeHints: readonly string[];
}

const isValidType = (value: string): value is IProjectType => {
	return ['library', 'cli', 'webapp', 'game', 'monorepo', 'generic'].includes(
		value,
	);
};

const normaliseOverride = (override: IProjectPatternLoose): IProjectPattern => {
	return {
		type: isValidType(override.type)
			? override.type
			: (override.type as IProjectType),
		describe: override.describe,
		recommendedTools: override.recommendedTools,
		recommendedPlugins: override.recommendedPlugins,
		knowledgeHints: override.knowledgeHints,
	};
};

/**
 * Build a fresh catalog by overlaying `overrides` on top of the
 * hardcoded `PROJECT_PATTERN_CATALOG`. Returns a new object so the
 * hardcoded catalog stays immutable.
 *
 * Host-defined types (keys not in the hardcoded catalog) are
 * accepted as-is. Tools and plugins from the override are
 * concatenated with the hardcoded ones, deduplicated by `name`, so
 * an override that drops a hardcoded tool is preserved (the override
 * is *additive*, not a full replacement).
 */
export const resolvePatternCatalog = (
	overrides?: Readonly<Record<string, IProjectPatternLoose | undefined>>,
): Readonly<Record<IProjectType, IProjectPattern>> & {
	readonly [hostKey: string]: IProjectPattern;
} => {
	if (overrides === undefined) return PROJECT_PATTERN_CATALOG;
	const merged: Record<string, IProjectPattern> = {
		...PROJECT_PATTERN_CATALOG,
	};
	for (const [key, override] of Object.entries(overrides)) {
		if (override === undefined) continue;
		const normalised = normaliseOverride(override);
		const base = merged[key];
		if (base === undefined) {
			// Brand-new project type or built-in without a baseline:
			// accept the override verbatim.
			merged[key] = normalised;
			continue;
		}
		const toolsByName = new Map<
			string,
			IProjectPattern['recommendedTools'][number]
		>();
		for (const tool of base.recommendedTools) {
			toolsByName.set(tool.name, tool);
		}
		for (const tool of normalised.recommendedTools) {
			toolsByName.set(tool.name, tool);
		}
		const pluginSet = new Set<string>(base.recommendedPlugins);
		for (const plugin of normalised.recommendedPlugins) {
			pluginSet.add(plugin);
		}
		merged[key] = {
			...base,
			...normalised,
			recommendedTools: [...toolsByName.values()],
			recommendedPlugins: [...pluginSet],
			knowledgeHints: [
				...new Set([
					...base.knowledgeHints,
					...normalised.knowledgeHints,
				]),
			],
		};
	}
	return merged as Readonly<Record<IProjectType, IProjectPattern>> & {
		readonly [hostKey: string]: IProjectPattern;
	};
};
