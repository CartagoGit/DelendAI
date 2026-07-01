/**
 * init-answers.constant.ts — frozen, durable plugin-id catalog for the
 * `init` workflow (f00084 S1).
 *
 * The set of plugin ids the `init` command accepts is derived from
 * `PRESET_CATALOG` (core) plus the opt-in `audit` plugin. The catalog
 * is consulted by both:
 *
 *   - `lib/init/init-answers.schema.ts` — the Zod schema refinement
 *     rejects plugin ids outside this set,
 *   - `lib/init/init-prompts.service.ts` — the interactive prompt lists
 *     the same ids so a typo'd input is corrected on the next iteration,
 *
 * Living under `contracts/constants/` makes the contract durable
 * (importable from any layer without side effects) and shared (other
 * host adapters can consult the same set without forking).
 *
 * Conventions:
 *   - `*.constant.ts` lives under `contracts/constants/`.
 *   - Constants are derived once at module load; the underlying sets
 *     are exposed as `ReadonlySet<string>` so consumers cannot mutate
 *     them.
 */
import { PRESET_CATALOG } from '@mcp-vertex/core/public';

/**
 * Every plugin id the `init` command accepts. Built once at module load
 * by walking `PRESET_CATALOG` and adding the opt-in `audit` plugin that
 * lives outside the canonical preset chain.
 */
const pluginIdsFromCatalog = (): ReadonlySet<string> => {
	const ids = new Set<string>();
	for (const preset of PRESET_CATALOG) {
		for (const member of preset.members) ids.add(member.plugin);
	}
	ids.add('audit');
	return ids;
};

/** The frozen set of plugin ids. Re-exported for schema refinements. */
export const PLUGIN_IDS: ReadonlySet<string> = pluginIdsFromCatalog();

/** Read-only list of plugin ids accepted by the schema (for help text). */
export const INIT_VALID_PLUGIN_IDS: ReadonlySet<string> = PLUGIN_IDS;