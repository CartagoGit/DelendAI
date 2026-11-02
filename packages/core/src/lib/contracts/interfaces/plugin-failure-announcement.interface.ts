/**
 * Operator-facing report of the plugins that did not come up.
 *
 * The loader degrades correctly on its own — a plugin that cannot be
 * resolved, or whose `register()` throws, is skipped and every other
 * plugin still loads. What these types carry is the other half: saying
 * so. A silent degradation reaches the operator only as an absence, and
 * an agent then cannot tell "this capability was never installed" from
 * "this capability failed to start", so it retries the call or treats
 * the gap as work to do.
 */
export interface IPluginLoadFailure {
	readonly specifier: string;
	readonly message: string;
}

export interface IPluginFailureAnnouncement {
	/** Lines to write, in order. Empty when nothing failed. */
	readonly lines: readonly string[];
	/** How many distinct plugins are degraded. */
	readonly failedCount: number;
}
