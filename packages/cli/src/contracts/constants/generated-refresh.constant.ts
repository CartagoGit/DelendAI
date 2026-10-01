/**
 * The generators re-run after a merge: `gen:all`, the one list of every
 * generator. This used to name only the catalog, so a merge that moved
 * any other derived file (the inventory, the guide index, the typed tool
 * outputs) left it stale until a later push failed on it.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = ['gen:all'];

/**
 * The only paths the refresh may commit. Bounding it is what stops a
 * post-merge commit from sweeping in work that is not its own.
 *
 * These are git pathspecs, and they cover every file a `gen:all` step
 * writes. The merge driver's rule table in `tools/scripts/git` names the
 * same files; its spec fails when the two lists differ.
 */
export const GENERATED_REFRESH_PATHS: readonly string[] = [
	'docs/delendai/agent-catalog.generated.json',
	'docs/delendai/host-hints/agent-instructions.generated.md',
	':(glob)**/AGENT.md',
	'docs/delendai/generated',
	'docs/delendai/security/permission-matrix.md',
	'docs/delendai/security/capability-matrix.md',
	'docs/delendai/plugins/auto-generated',
	'apps/web/src/data/plugins/catalog.generated.ts',
	'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
	'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts',
	'docs/delendai/CORE-PUBLIC-API-INVENTORY.md',
	'docs/delendai/TOKEN-BUDGETS.md',
	'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts',
	'packages/core/schema/delendai.config.schema.json',
	'docs/delendai/api/stable.json',
	'packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts',
	'docs/delendai/AUTHORITIES.md',
	'packages/cli/src/lib/init/init-skill-inventory.generated.ts',
	':(glob)**/src/generated/tool-outputs.ts',
	'docs/delendai/README.md',
	'README.md',
];
