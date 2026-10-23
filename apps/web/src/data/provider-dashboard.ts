/**
 * provider-dashboard.ts — f00098 S5 web-parity data.
 *
 * Static showcase data for the `/providers` page: a documented, fully
 * static rendering of the provider-status dashboard the VS Code host
 * shows live. Two sources of truth are mirrored here — never re-invented:
 *
 *   1. **Render-model vocabulary** — the shapes below are re-declared 1:1
 *      from the f00098 S1 contract
 *      (`packages/ui-extension/src/contracts/interfaces/
 *      provider-status.interface.ts`). The web app does not depend on
 *      `@delendai/ui-extension` (the S1 package itself re-declares the
 *      same vocabulary from core for the identical reason), so the minimal
 *      shapes are copied field-for-field: `ProviderState`,
 *      `IProviderQuotaMeter`, `IProviderStatusRow`,
 *      `IProviderStatusReadyModel`, `IProviderStatusAbsentModel`.
 *      `reachable` keeps its one-line meaning (`state === 'available'`,
 *      core `IProviderSummary.reachable`).
 *   2. **Roster config schema** — the `delendai.config.json` example
 *      mirrors the root-level `providers` block from
 *      `packages/core/src/lib/plugins/config-file-schema.ts`
 *      (`PROVIDER_ENTRY_SCHEMA` / `PROVIDER_INVOKE_SCHEMA`, f00067a S1).
 *      Secrets posture: config files carry env-var NAMES only
 *      (`"envVar": "OPENAI_API_KEY"`) or `${ENV_VAR}`-style references —
 *      never a cleartext key (enforced repo-wide by
 *      `lint:no-cleartext-secrets`).
 *
 * The page has NO live server dependency (f00098 non-goal): the sample
 * models below are frozen fixtures that demonstrate the exact shapes the
 * S1 builder emits, including the degraded plugin-absent model.
 */

// ─── Render-model vocabulary (mirrors f00098 S1, commit 15310997) ───────────

/** Runtime states a provider can be in (mirrors core `ProviderState`). */
export type ProviderState =
	| 'available'
	| 'quota-exceeded'
	| 'rate-limited'
	| 'unauthenticated'
	| 'not-installed'
	| 'model-unavailable'
	| 'error';

/** Quota window names (mirrors `QuotaWindowSchema.window`). */
export type QuotaWindowName = 'hourly' | 'weekly' | 'monthly';

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

// ─── Showcase fixtures ───────────────────────────────────────────────────────

/** Every provider state, in dashboard legend order. */
export const PROVIDER_STATES: readonly ProviderState[] = [
	'available',
	'quota-exceeded',
	'rate-limited',
	'unauthenticated',
	'not-installed',
	'model-unavailable',
	'error',
];

/**
 * Exact opt-in snippet (mirrors `ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET` in the
 * S1 builder — the runner hard-depends on usage-tracking, so both load).
 */
export const ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET =
	'delendai --plugins=usage-tracking,orchestrator-runner';

/**
 * Root-level `providers` roster example for `delendai.config.json`
 * (f00067a S1). Field-for-field valid against `PROVIDER_ENTRY_SCHEMA`:
 * one entry per invoke kind (`api`, `cli`, `subscription`), kebab-case
 * ids, capability tags from `CAPABILITY_TAGS`. Note the api entry's
 * `envVar` — the NAME of the environment variable, never the key itself.
 */
export const PROVIDER_ROSTER_CONFIG_EXAMPLE = `{
	"providers": [
		{
			"id": "gpt-5-codex",
			"kind": "api",
			"invoke": {
				"kind": "api",
				"url": "https://api.openai.com/v1/responses",
				"method": "POST",
				"envVar": "OPENAI_API_KEY"
			},
			"modelId": "gpt-5-codex",
			"contextWindow": 400000,
			"costTier": 4,
			"strengths": ["code-edit", "agentic", "json-strict"],
			"weaknesses": ["very-long-context"]
		},
		{
			"id": "claude-sonnet",
			"kind": "cli",
			"invoke": { "kind": "cli", "command": "claude", "args": ["-p"] },
			"modelId": "claude-sonnet-4-5",
			"contextWindow": 200000,
			"costTier": 3,
			"strengths": ["reasoning", "long-context", "architecture"],
			"weaknesses": []
		},
		{
			"id": "copilot-gpt",
			"kind": "subscription",
			"invoke": { "kind": "subscription", "tool": "vscode-copilot" },
			"modelId": "gpt-5-mini",
			"contextWindow": 128000,
			"costTier": 1,
			"strengths": ["fast-iteration", "code-edit"],
			"weaknesses": ["security-audit"]
		}
	]
}`;

/**
 * A frozen `healthcheck_providers` + `get_quota` projection: exactly what
 * the S1 builder returns for a three-provider roster with one healthy CLI,
 * one quota-exceeded API provider, and one missing CLI (install hint).
 */
export const PROVIDER_STATUS_SHOWCASE: IProviderStatusReadyModel = {
	kind: 'ready',
	checkedAt: '2026-07-06T12:00:00.000Z',
	summary: { total: 3, available: 1, unavailable: 2 },
	emptyRoster: false,
	rows: [
		{
			id: 'claude-sonnet',
			state: 'available',
			reachable: true,
			modelId: 'claude-sonnet-4-5',
			modelAvailable: true,
			cliInstalled: true,
			cliVersion: '2.1.0',
			authenticated: true,
			authTier: 'max',
			installHint: null,
			quota: [
				{
					window: 'weekly',
					limit: 1000,
					used: 412,
					resetAt: '2026-07-13T00:00:00.000Z',
					usedPct: 41,
				},
			],
		},
		{
			id: 'gpt-5-codex',
			state: 'quota-exceeded',
			reachable: false,
			modelId: 'gpt-5-codex',
			modelAvailable: true,
			cliInstalled: true,
			cliVersion: '0.44.0',
			authenticated: true,
			authTier: 'plus',
			installHint: null,
			quota: [
				{
					window: 'hourly',
					limit: 50,
					used: 63,
					resetAt: '2026-07-06T13:00:00.000Z',
					usedPct: 126,
				},
				{
					window: 'monthly',
					limit: 20000,
					used: 9200,
					resetAt: '2026-08-01T00:00:00.000Z',
					usedPct: 46,
				},
			],
		},
		{
			id: 'gemini-pro',
			state: 'not-installed',
			reachable: false,
			modelId: 'gemini-2.5-pro',
			modelAvailable: null,
			cliInstalled: false,
			cliVersion: null,
			authenticated: null,
			authTier: null,
			installHint: {
				command: 'npm install -g @google/gemini-cli',
				dangerous: false,
				caveat: 'Installs a global npm binary; review the package first.',
			},
			quota: [],
		},
	],
	quota: {
		present: true,
		updatedAt: '2026-07-06T11:58:00.000Z',
		note: null,
	},
};

/**
 * The degraded model rendered when orchestrator-runner is not loaded —
 * hint + snippet verbatim from the S1 builder, never an error state.
 */
export const PROVIDER_STATUS_ABSENT_SHOWCASE: IProviderStatusAbsentModel = {
	kind: 'plugin-absent',
	plugin: 'orchestrator-runner',
	hint: 'The orchestrator-runner plugin is not loaded. It is opt-in (not in any preset): start the server with it enabled to see provider health and quota.',
	configSnippet: ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET,
};
