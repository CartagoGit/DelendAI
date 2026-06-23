/**
 * Single Responsibility: static command templates per preset.
 *
 * Today the *actual* command strings are produced by an
 * `ICommandSetProvider` at call time (per-area context). This
 * interface exists for the rare case where a preset needs to ship
 * a non-standard template (e.g. `pnpm exec` prefix for the project
 * command, or a Docker wrapper for the check step). The default
 * provider ignores these fields.
 */
export interface IPresetCommands {
	/** Optional static template for the *check* step. */
	readonly checkTemplate?: string;
	/** Optional static template for the *fix* step. */
	readonly fixTemplate?: string;
}
