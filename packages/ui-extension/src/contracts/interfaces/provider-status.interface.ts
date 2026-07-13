/**
 * provider-status.interface.ts — f00098 S1.
 *
 * Render-model contract for the provider-status dashboard. The builder
 * (`../../dashboard/builders/provider-status.builder`) maps the raw
 * `healthcheck_providers` + `get_quota` tool payloads (orchestrator-runner
 * plugin) into `IProviderStatusModel`, which hosts (vscode webview, web
 * showcase) render without re-deriving any domain logic.
 *
 * Vocabulary note: this package does not depend on `@mcp-vertex/core`, so
 * the minimal shapes below are re-declared 1:1 from the canonical core
 * contract (`packages/core/src/lib/contracts/interfaces/
 * provider-capabilities.interface.ts` — `ProviderState`,
 * `IProviderAvailability.state`) and the runner's tool output schemas
 * (`plugins/orchestrator-runner/src/lib/schemas.ts` —
 * `HealthcheckOutputSchema`, `GetQuotaOutputSchema`). No re-invented
 * fields: `reachable` is the same one-line projection
 * (`state === 'available'`) `IProviderSummary.reachable` uses.
 */

/** Runtime states a provider can be in (mirrors core `ProviderState`). */
export type ProviderState =
	| 'available'
	| 'quota-exceeded'
	| 'rate-limited'
	| 'unauthenticated'
	| 'not-installed'
	| 'model-unavailable'
	| 'error';

/** Install hint attached to a missing CLI (mirrors `InstallHintSchema`). */
export interface IProviderInstallHintPayload {
	readonly tool: string;
	readonly args: readonly string[];
	readonly pipeTo?: 'sh';
	readonly dangerous: boolean;
	readonly caveat: string;
}

/** One row of `healthcheck_providers` output (`ProviderHealthSchema`). */
export interface IProviderHealthRowPayload {
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
	readonly installHint?: IProviderInstallHintPayload;
}

/** Raw `healthcheck_providers` payload (`HealthcheckOutputSchema`). */
export interface IHealthcheckProvidersPayload {
	readonly checkedAt: string;
	readonly providers: readonly IProviderHealthRowPayload[];
	readonly summary: {
		readonly total: number;
		readonly available: number;
		readonly unavailable: number;
	};
}

/** Quota window names (mirrors `QuotaWindowSchema.window`). */
export type QuotaWindowName = 'hourly' | 'weekly' | 'monthly';

/** One quota window of `get_quota` output (`QuotaWindowSchema`). */
export interface IQuotaWindowPayload {
	readonly window: QuotaWindowName;
	readonly limit: number | null;
	readonly used: number | null;
	readonly resetAt: string | null;
}

/** Raw `get_quota` payload (`GetQuotaOutputSchema`). */
export interface IGetQuotaPayload {
	readonly present: boolean;
	readonly updatedAt: string | null;
	readonly providers: Readonly<
		Record<string, readonly IQuotaWindowPayload[]>
	>;
	readonly note?: string;
}

// ─── Render model ────────────────────────────────────────────────────────────

/** A quota window projected for rendering, with a precomputed meter %. */
export interface IProviderQuotaMeter {
	readonly window: QuotaWindowName;
	readonly limit: number | null;
	readonly used: number | null;
	readonly resetAt: string | null;
	/**
	 * `used / limit` in whole percent; `null` when either side is unknown
	 * or the limit is 0. Can exceed 100 (quota-exceeded providers).
	 */
	readonly usedPct: number | null;
}

/** One provider row of the dashboard render-model. */
export interface IProviderStatusRow {
	readonly id: string;
	readonly state: ProviderState;
	/** Projection of `state === 'available'` (core `IProviderSummary.reachable`). */
	readonly reachable: boolean;
	readonly modelId: string;
	readonly modelAvailable: boolean | null;
	readonly cliInstalled: boolean;
	readonly cliVersion: string | null;
	readonly authenticated: boolean | null;
	readonly authTier: string | null;
	/** Flattened install hint for missing CLIs; `null` when installed. */
	readonly installHint: {
		readonly command: string;
		readonly dangerous: boolean;
		readonly caveat: string;
	} | null;
	readonly quota: readonly IProviderQuotaMeter[];
}

/** Dashboard model when orchestrator-runner is loaded. */
export interface IProviderStatusReadyModel {
	readonly kind: 'ready';
	readonly checkedAt: string;
	readonly summary: {
		readonly total: number;
		readonly available: number;
		readonly unavailable: number;
	};
	/** `true` when the plugin is loaded but no providers are configured. */
	readonly emptyRoster: boolean;
	readonly rows: readonly IProviderStatusRow[];
	readonly quota: {
		readonly present: boolean;
		readonly updatedAt: string | null;
		readonly note: string | null;
	};
}

/**
 * Degraded model when the orchestrator-runner plugin is not loaded (it is
 * opt-in, never in a preset). Hosts render the hint + snippet — never an
 * error state (f00098 non-goal).
 */
export interface IProviderStatusAbsentModel {
	readonly kind: 'plugin-absent';
	readonly plugin: 'orchestrator-runner';
	readonly hint: string;
	readonly configSnippet: string;
}

export type IProviderStatusModel =
	| IProviderStatusReadyModel
	| IProviderStatusAbsentModel;
