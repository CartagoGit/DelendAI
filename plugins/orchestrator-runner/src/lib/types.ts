/**
 * types.ts — orchestrator-runner local vocabulary.
 *
 * The provider/routing contract itself is canonical in
 * `@mcp-vertex/core/public` (f00067 S1). This file only holds the small
 * runner-local shapes that are NOT part of that durable contract: the
 * cost-preference axis, the scoring hint, the healthcheck report rows and
 * the plugin options. Nothing here redefines a core type.
 */
import type {
	CapabilityTag,
	ProviderState,
	RoutingMode,
} from '@mcp-vertex/core/public';

/** How aggressively the caller wants to trade spend for capability. */
export type CostPreference = 'minimize' | 'balanced' | 'maximize';

/** The three inputs the pure scorer matches a provider against. */
export interface IRoutingHint {
	readonly mode: RoutingMode;
	readonly capabilities: readonly CapabilityTag[];
	readonly costPref: CostPreference;
}

/**
 * Install guidance for a missing provider CLI. `pipeTo: 'sh'` (a
 * `curl … | sh` style install) is always flagged `dangerous: true`
 * (CRITICAL I4) so a host never silently pipes a remote script to a
 * shell. `caveat` is a human-readable warning; the localized variants
 * live in the web i18n catalogue (runtime strings are English by the MCP
 * SDK contract, same as every tool description).
 */
export interface IInstallHint {
	readonly tool: string;
	readonly args: readonly string[];
	readonly pipeTo?: 'sh' | undefined;
	readonly dangerous: boolean;
	readonly caveat: string;
}

/** Per-provider healthcheck row returned by `<prefix>_healthcheck_providers`. */
export interface IProviderHealthReport {
	readonly id: string;
	readonly cli: {
		readonly installed: boolean;
		readonly path: string | null;
		readonly version: string | null;
	};
	readonly auth: {
		readonly authenticated: boolean | null;
		readonly tier: string | null;
	};
	readonly model: {
		readonly requested: string;
		readonly available: boolean | null;
	};
	readonly overall: ProviderState;
	readonly installHint?: IInstallHint | undefined;
}

/** Result of probing a single CLI on the host PATH. */
export interface ICliProbeResult {
	readonly installed: boolean;
	readonly path: string | null;
	readonly version: string | null;
}

/**
 * Minimal loop-detection seam (CRITICAL: reuse, do NOT duplicate).
 *
 * The runner never instantiates its own detector. It consumes an
 * injected one that is structurally compatible with the proposals plugin's
 * `AgentLoopDetectorService.isAgentStuck(toolName, args)`. The concrete
 * instance is injected by the host wiring via
 * `ctx.options.dependencies.loopDetector` (see `resolveLoopDetectionSeam`),
 * so there is no cross-plugin import and no second detector. In S4 the only
 * consumer is `advise_routing`, which annotates a decision with a
 * `loopWarning` when the same session keeps asking for the same route.
 */
export interface ILoopDetectionSeam {
	isAgentStuck(
		toolName: string,
		args: unknown,
	): { handoffPath: string; suggestedAction: string } | null;
}
