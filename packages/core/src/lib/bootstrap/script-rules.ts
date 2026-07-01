// script-rules: declarative tables for picking the quality-gate
// scripts from a `package.json` `scripts` block.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// policy for "which `package.json` script roles are worth surfacing
// to the agent as `run_<role>` tools". It is data, not behaviour.
//
// SOLID — Open/Closed. Adding a new quality role, an alias or a
// lifecycle hook is a one-entry change to one of the three
// constants. The picker function never has to change.

/**
 * The "primary" quality-gate roles. Every project that has any of
 * these in `scripts` will get the corresponding `run_<role>` tool
 * scaffolded. Order matters only for the picker's iteration; the
 * output keys are independent of the input order.
 */
export const QUALITY_ROLES: readonly string[] = [
	'lint',
	'test',
	'build',
	'typecheck',
] as const;

/**
 * Aliases for the primary roles. The picker normalises the key to
 * its primary name (`type-check` → `typecheck`). Open/Closed: a new
 * alias is a one-entry addition.
 */
export const QUALITY_ROLE_ALIASES: Readonly<Record<string, string>> = {
	'type-check': 'typecheck',
	'ts-check': 'typecheck',
	'check-types': 'typecheck',
	'lint:fix': 'lint:fix',
};

/**
 * Lifecycle hook names. These are noise for the agent — npm runs
 * them on install / publish, not on demand. The picker excludes
 * them.
 */
export const LIFECYCLE_SCRIPT_BLACKLIST: ReadonlySet<string> = new Set([
	'prepare',
	'postinstall',
	'preinstall',
	'prepublish',
	'prepack',
	'postpack',
	'preversion',
	'postversion',
	'prepublishOnly',
	'install',
	'uninstall',
	'pack',
]);

/**
 * `pre*` and `post*` script names (e.g. `pretest`, `postbuild`) are
 * npm-defined companions to the corresponding primary role. The
 * picker excludes them — the agent runs `npm test`, not
 * `pretest`/`posttest` separately.
 */
export const SCRIPT_PREFIX_BLACKLIST: readonly string[] = ['pre', 'post'];

/**
 * A role is "blacklisted" when it is in the lifecycle set OR starts
 * with a blacklisted prefix. Pure, allocation-free in the hot path
 * (the picker calls this once per script entry).
 */
export const isBlacklistedScriptRole = (role: string): boolean => {
	if (LIFECYCLE_SCRIPT_BLACKLIST.has(role)) return true;
	for (const prefix of SCRIPT_PREFIX_BLACKLIST) {
		if (role.startsWith(prefix)) return true;
	}
	return false;
};
