/**
 * skill-paths.ts — the single source of truth for where mcp-vertex skills
 * live on disk (f00065 S1).
 *
 * Skills are owned by the package/plugin they apply to, NOT stored in `docs`:
 *
 *   packages/core/skills/<name>/SKILL.md      — core + transversal skills
 *   plugins/<plugin>/skills/<name>/SKILL.md   — plugin-specific skills
 *
 * The composed, version-pinned manifest lives with its primary loader (core):
 *
 *   packages/core/skills/manifest.json
 *
 * Every consumer — the core loader (`load-skills.ts`), the CLI assembler
 * (`assemble.ts`), the web catalogue generator (`gen-skills.ts`), and the
 * `check-skills` lint gate — resolves skill locations through THIS module so
 * the path is defined exactly once. `docs/mcp-vertex/skills/**` is no longer a
 * skill store; it is documentation only.
 */

/** Workspace-relative root that owns core + transversal skills. */
export const CORE_SKILLS_ROOT = 'packages/core/skills';

/** Workspace-relative path to the composed, version-pinned skill manifest. */
export const SKILL_MANIFEST_REL = `${CORE_SKILLS_ROOT}/manifest.json`;

/** Workspace-relative skills root owned by a given plugin. */
export const pluginSkillsRoot = (plugin: string): string =>
	`plugins/${plugin}/skills`;

/**
 * Map a skill's primary `appliesTo` namespace to the workspace-relative root
 * that owns it. `@mcp-vertex/*` and `@mcp-vertex/core` are owned by the core
 * package; `@mcp-vertex/<plugin>` is owned by that plugin. When a skill applies
 * to several plugins the FIRST entry is the canonical owner.
 */
export const ownerRootForAppliesTo = (appliesTo: readonly string[]): string => {
	const primary = appliesTo[0] ?? '@mcp-vertex/*';
	if (primary === '@mcp-vertex/*' || primary === '@mcp-vertex/core')
		return CORE_SKILLS_ROOT;
	const plugin = primary.split('/')[1];
	return plugin ? pluginSkillsRoot(plugin) : CORE_SKILLS_ROOT;
};

/** The workspace-relative `bodyPath` for a skill `name` under `ownerRoot`. */
export const skillBodyPath = (ownerRoot: string, name: string): string =>
	`${ownerRoot}/${name}/SKILL.md`;

/**
 * Candidate workspace-relative skill roots to scan for SKILL.md files, given
 * the list of plugin directory names present in the workspace. Always includes
 * the core root; appends a `plugins/<name>/skills` root for every plugin so
 * discovery does not need to hardcode which plugins own skills. Callers filter
 * out roots that do not exist on disk.
 */
export const skillOwnerRoots = (
	pluginNames: readonly string[],
): readonly string[] => [
	CORE_SKILLS_ROOT,
	...pluginNames.map((name) => pluginSkillsRoot(name)),
];
