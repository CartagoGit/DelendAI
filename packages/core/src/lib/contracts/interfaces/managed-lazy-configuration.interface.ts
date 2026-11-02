/**
 * Outcome of the managed-lazy configuration pass. `failures` exists so
 * one plugin that cannot be imported degrades to "unavailable" instead
 * of aborting the whole server start — see
 * `validateManagedLazyConfiguration`.
 */
export interface IManagedLazyConfigurationResult {
	/** Cross-plugin configuration problems. */
	readonly issues: readonly string[];
	/** Plugins that could not be imported or whose options were invalid. */
	readonly failures: ReadonlyArray<{
		readonly specifier: string;
		readonly message: string;
	}>;
}
