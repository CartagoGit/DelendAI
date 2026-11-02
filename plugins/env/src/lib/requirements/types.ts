/**
 * requirements/types.ts — f00135 S2: env-var → capability contract.
 *
 * An env var is *required by* a plugin when the plugin's `optionsSchema`
 * has a field whose `.describe(...)` string includes `env:VAR_NAME`. The
 * extraction walker (`extract.ts`) builds the catalog once per plugin,
 * and the explainer (`explain.ts`) diffs it against the parsed `.env`
 * to report which capabilities are unlocked vs blocked.
 *
 * The shape is intentionally small and stable: any plugin can be added
 * to the catalog by tagging the right `describe()` text; the
 * explainer needs only this DTO.
 */

/** A single env-var → plugin capability binding. */
export interface IEnvRequirement {
	/** The .env variable name (uppercase by convention). */
	readonly var: string;
	/** The plugin id that needs this var to unlock its capability. */
	readonly plugin: string;
	/** Human-readable capability the var enables (e.g. "GitHub API auth"). */
	readonly capability: string;
	/**
	 * Optional provider routing tag — when the plugin dispatches through
	 * a provider, this is the provider id the var unlocks (e.g. "github").
	 */
	readonly provider?: string;
	/** Whether the var must be present AND non-empty to unlock the capability. */
	readonly required: boolean;
}

/** A capability that is unlocked because every required env var is present. */
export interface IUnlockedCapability {
	readonly plugin: string;
	readonly capability: string;
	readonly provider?: string;
	readonly satisfiedBy: readonly string[];
}

/** A capability blocked by one or more missing/empty env vars. */
export interface IBlockedCapability {
	readonly plugin: string;
	readonly capability: string;
	readonly provider?: string;
	readonly missing: readonly string[];
}

/** The full explainer output. */
export interface IEnvExplain {
	/** All capabilities the catalog knows about (union of unlocked + blocked). */
	readonly capabilities: readonly (
		| IUnlockedCapability
		| IBlockedCapability
	)[];
	/** Capabilities blocked by missing/empty env vars. */
	readonly blocked: readonly IBlockedCapability[];
	/** Unblocked capabilities that are present. */
	readonly unlocked: readonly IUnlockedCapability[];
	/** Env vars the catalog requires that are completely missing from the file. */
	readonly completelyMissing: readonly string[];
}
