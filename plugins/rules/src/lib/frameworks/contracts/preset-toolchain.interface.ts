/**
 * Single Responsibility: declare the binaries / packages a project
 * must install before the preset's commands can run. `check_rules`
 * is the only consumer — it surfaces a "missing linter deps"
 * finding before the agent wastes a run.
 */
export interface IPresetToolchain {
	/**
	 * Binaries or packages the materialised linter config needs.
	 * Empty for linters that are vendored by the project (e.g.
	 * Laravel's `pint` ships under `./vendor/bin/pint`).
	 */
	readonly requiredLinterDeps?: readonly string[];
}
