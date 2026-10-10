/**
 * external-mcp/types.ts — f00193 (Track K / external MCPs).
 *
 * Pure type surface for the external-MCP control plane. This module
 * is host-agnostic: it declares what a provider looks like and how
 * the router reasons over a set of providers, without taking a
 * dependency on the transport layer (stdio/http) or on any
 * provider-specific vocabulary.
 *
 * Design notes (SRP + DIP):
 *   - `IExternalMcpProvider` is the data shape the config loader
 *     produces and the router consumes. Transport is data, not code
 *     — the connector (`connect()`) is an injected factory, which
 *     lets tests substitute fake transports without touching the
 *     router logic.
 *   - Capability ids use the typed `Capability` union from core
 *     (`@delendai/core/contracts`) for declared providers, but the
 *     shape is `string` so future custom capabilities (e.g. an
 *     external-only `mcp-ext:foo`) still parse without a core
 *     schema bump.
 *   - Privacy (R1.1, R1.6): a `provider.id` is public; tool names
 *     are NEVER carried on the type surface — they are computed
 *     lazily from the `connect()` factory and stripped before any
 *     log emission.
 */

/**
 * Capability id, narrowable to the typed union when known.
 *
 * We re-export the type via the contracts barrel so consumers do
 * not have to add `@delendai/core` to their imports just to type
 * a provider.
 */
export type ExternalMcpCapability = string;

export type ExternalMcpTransport = 'stdio' | 'http';

/**
 * Cost declaration. We keep the unit explicit so the router can
 * compare providers without an implicit currency conversion. Both
 * fields are optional; absence means "the host does not have a cost
 * model for this provider" — which is the default, and the router
 * treats it as the cheapest possible (free) so providers that DO
 * declare cost are penalised (which is the safe default for
 * budgets).
 */
export interface IExternalMcpCost {
	/** Tokens charged per 1k input tokens. Optional. */
	readonly tokensPer1k?: number;
	/** USD cost per 1k tokens. Optional; for budget-aware routing (f00195). */
	readonly usdPer1k?: number;
}

/**
 * Health snapshot produced by a provider's `healthCheck()`. Pure
 * data — the factory owns the implementation (ping, http call,
 * process probe, etc.).
 */
export interface IExternalMcpHealth {
	readonly ok: boolean;
	readonly latencyMs: number;
	/** ISO-8601 timestamp the snapshot was taken. */
	readonly checkedAt: string;
	/** When `ok === false`, an opaque error reason (no secrets). */
	readonly reason?: string;
}

export type ProviderHealthState = 'healthy' | 'degraded' | 'down';

/**
 * A factory the registry uses to lazily connect to the provider
 * the first time the router selects it. Returning a tiny
 * `IExternalMcpConnection` (just enough to call + teardown) keeps
 * the type honest — the router never sees raw tool names.
 */
export interface IExternalMcpConnection {
	/** Ping the provider; the contract is "respond within latencyMs". */
	ping(): Promise<{ ok: boolean; latencyMs: number }>;
	/** Tear the connection down; called when the registry evicts the provider. */
	close(): Promise<void>;
}

export interface IExternalMcpProvider {
	/**
	 * Stable, public id (e.g. `openai-mcp`). Used in config and in
	 * the redacted log surface as `ext-mcp-<hash>`. NEVER a host
	 * name, never a tool name.
	 */
	readonly id: string;
	readonly transport: ExternalMcpTransport;
	/** Declared capabilities this provider exposes (forward-compatible). */
	readonly capabilities: readonly ExternalMcpCapability[];
	/** Optional cost model; absence ⇒ treated as 0 (free). */
	readonly cost?: IExternalMcpCost;
	/**
	 * Optional priority hint. Higher wins when two providers tie on
	 * every other dimension. Negative values are allowed (pin to
	 * the back of the queue). Defaults to 0.
	 */
	readonly priority?: number;
	/** Lazy connect: the registry calls this exactly once per provider. */
	connect(): Promise<IExternalMcpConnection>;
	/** Cheap health probe; the registry pings every N minutes. */
	healthCheck(): Promise<IExternalMcpHealth>;
}

/**
 * The redacted form of a provider id used in logs. Stable per
 * session so a reader can correlate entries without seeing the real
 * provider name (R1.1).
 */
export type RedactedProviderId = `ext-mcp-${string}`;

/**
 * The selection decision the router returns. Carries the chosen
 * provider + a short, deterministic reason code so the caller can
 * log/audit without rebuilding it.
 */
export interface IExternalMcpSelection {
	readonly kind: 'external-mcp-selection';
	readonly providerId: string;
	readonly redactedId: RedactedProviderId;
	readonly capability: string;
	readonly score: number;
	readonly reason:
		| 'only-candidate'
		| 'capability-match'
		| 'preferred'
		| 'lowest-cost'
		| 'best-health'
		| 'failover';
	readonly health: ProviderHealthState;
	readonly latencyMs: number;
}

/**
 * Refusal returned when no provider can satisfy the capability.
 * Same envelope shape as core refusals (R5.1 contract).
 */
export interface IExternalMcpRefusal {
	readonly kind: 'external-mcp-no-provider';
	readonly capability: string;
	readonly candidates: readonly string[];
	readonly reasons: readonly string[];
}

/**
 * Default router weights. Exposed as constants so callers can tune
 * the router via config without forking the function.
 */
export const DEFAULT_ROUTER_WEIGHTS = Object.freeze({
	/** Multiplier applied to cost. Higher = cost matters more. */
	cost: 1,
	/** Multiplier applied to latencyMs. Higher = latency matters more. */
	latency: 0.01,
	/** Multiplier applied to the health penalty (0 healthy, 1 degraded, 5 down). */
	health: 50,
	/** Bonus for providers explicitly preferred in config (e.g. `preferred: ['openai-mcp']`). */
	preferredBonus: 100,
});

/**
 * The router options. All fields are optional and have safe
 * defaults baked into `DEFAULT_ROUTER_WEIGHTS`.
 */
export interface IExternalMcpRouterOptions {
	readonly weights?: Partial<typeof DEFAULT_ROUTER_WEIGHTS>;
	/**
	 * Providers the user prefers for capabilities they can serve.
	 * The router adds `preferredBonus` to their score.
	 */
	readonly preferred?: readonly string[];
	/**
	 * Providers to never route to (e.g. temporarily disabled, or
	 * blocked by the compliance check).
	 */
	readonly excluded?: readonly string[];
}
