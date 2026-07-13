/**
 * guard.ts — CRITICAL I15 dependency guard.
 *
 * `orchestrator-runner` must never run without `usage-tracking` loaded:
 * every provider invocation it advises (and, from S6, executes) has to be
 * recorded so the user can audit spend. Two layers enforce this:
 *
 *  1. `IMcpPlugin.dependsOn = ['usage-tracking']` — the loader's
 *     `checkPluginDependencies` inspects the LOADED plugin set for the
 *     `usage-tracking` id after every plugin registers and refuses the
 *     whole batch (no partial registration) with a clear combined error
 *     when it is absent. That is the authoritative runtime loaded-set
 *     check.
 *  2. `assertUsageTrackingLoaded` (below) — a pure guard the plugin calls
 *     from `register()` against `ctx.peerPlugins`. It throws a clear
 *     error. Note the peer registry is EMPTY at register time by design
 *     (it is populated post-load), so `register()` only invokes this when
 *     the registry is already populated (a host that pre-seeded it); the
 *     empty-at-register case defers to layer 1. This keeps a normal boot
 *     from false-tripping while still giving a hard, tested throw.
 *
 * No compile-time import of the usage-tracking package is used (no
 * workspace alias exists yet — that is S9's job): the check is purely by
 * plugin id.
 */

/** The plugin id this runner hard-depends on. */
export const USAGE_TRACKING_PLUGIN = 'usage-tracking' as const;

/**
 * Throw a clear error when `usage-tracking` is not in the given loaded
 * plugin set. Pure over its input so it is trivially unit-testable.
 */
export const assertUsageTrackingLoaded = (
	loadedPluginNames: readonly string[],
): void => {
	if (!loadedPluginNames.includes(USAGE_TRACKING_PLUGIN)) {
		throw new Error(
			`orchestrator-runner requires the "${USAGE_TRACKING_PLUGIN}" plugin to be loaded (CRITICAL I15): ` +
				`every routing decision it advises must be recorded for spend auditing. ` +
				`Load it too, e.g. \`mcp-vertex --plugins=${USAGE_TRACKING_PLUGIN},orchestrator-runner\`. ` +
				`It is also declared as a hard \`dependsOn\`, so the loader refuses the batch when it is missing.`,
		);
	}
};
