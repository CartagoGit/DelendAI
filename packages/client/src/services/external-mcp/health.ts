/**
 * external-mcp/health.ts — f00193 (Track K / external MCPs).
 *
 * The health-check helper the registry calls on each provider.
 * Pure logic — owns no timers, no sockets. The registry owns the
 * cadence; this module just turns the provider's `healthCheck()`
 * output into a structured state.
 *
 * Privacy (R1.1): only the provider id (public) + latency/reason
 * (no secrets) appear on the output. Tool names never appear here.
 */

import type {
	IExternalMcpHealth,
	IExternalMcpProvider,
	ProviderHealthState,
} from './types';

/** Threshold above which a healthy provider flips to `degraded`.
 *  Below 250ms by default so the dashboard's "green chip" remains
 *  a reliable signal in normal conditions. Tunable per-call. */
export const DEFAULT_DEGRADED_LATENCY_MS = 250;

/** Threshold above which a provider is considered `down` from a
 *  health perspective even if the probe did not explicitly fail. */
export const DEFAULT_DOWN_LATENCY_MS = 2_000;

export interface IClassifyHealthOptions {
	readonly degradedLatencyMs?: number;
	readonly downLatencyMs?: number;
}

/**
 * Classify a health probe result into the coarse states the router
 * and dashboard consume.
 *
 *   - `ok === true && latency < degradedLatencyMs` → `healthy`
 *   - `ok === true && latency >= degradedLatencyMs` → `degraded`
 *   - `ok === false` → `down` (a probe that explicitly returned
 *     failure is always down; latency doesn't rehabilitate it).
 *
 * Pure.
 */
export const classifyHealth = (
	probe: IExternalMcpHealth,
	options: IClassifyHealthOptions = {},
): ProviderHealthState => {
	const degradedMs = options.degradedLatencyMs ?? DEFAULT_DEGRADED_LATENCY_MS;
	if (!probe.ok) return 'down';
	if (probe.latencyMs < degradedMs) return 'healthy';
	return 'degraded';
};

/**
 * Convenience wrapper that calls `provider.healthCheck()` and
 * classifies the result. Catches any error and reports it as a
 * `down` snapshot — the registry must never throw from a probe.
 */
export const probeProvider = async (
	provider: Pick<IExternalMcpProvider, 'id' | 'healthCheck'>,
	options: IClassifyHealthOptions = {},
): Promise<{ state: ProviderHealthState; probe: IExternalMcpHealth }> => {
	const start = new Date().toISOString();
	try {
		const probe = await provider.healthCheck();
		return { state: classifyHealth(probe, options), probe };
	} catch (err: unknown) {
		const reason = err instanceof Error ? err.message : 'probe failed';
		const failed: IExternalMcpHealth = {
			ok: false,
			latencyMs: 0,
			checkedAt: start,
			reason,
		};
		return { state: classifyHealth(failed, options), probe: failed };
	}
};

/**
 * Pick the better of two health states, ordered
 * healthy > degraded > down.
 */
export const worstOf = (
	a: ProviderHealthState,
	b: ProviderHealthState,
): ProviderHealthState => {
	const order: Record<ProviderHealthState, number> = {
		healthy: 0,
		degraded: 1,
		down: 2,
	};
	return order[a] >= order[b] ? a : b;
};
