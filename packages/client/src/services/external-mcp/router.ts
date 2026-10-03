/**
 * external-mcp/router.ts — f00193 (Track K / external MCPs).
 *
 * The router itself: given a capability and the live provider set,
 * pick the best provider, redact its id for logs, and return a
 * selection or a refusal.
 *
 * Pure — no I/O, no global state. The registry owns the
 * connections; the router only consumes the (already-probed) data
 * the registry exposes via `IRouterInput`.
 *
 * Design notes (SRP + OCP):
 *   - Scoring is a transparent utility function with named
 *     dimensions (cost, latency, health, priority, preferred). The
 *     weights are tunable via `IExternalMcpRouterOptions` so an
 *     operator can dial up "cost matters" without touching code.
 *   - Failover is a separate function: `selectWithFailover` tries
 *     the primary, then ranks the rest as candidates. A provider
 *     whose health is `down` is NEVER picked unless every other
 *     candidate is also `down` — at which point we pick the
 *     lowest-latency `down` provider so the caller gets a typed
 *     refusal instead of a hang.
 *   - Redaction: the router returns BOTH `providerId` (for the
 *     caller to actually call the provider) and `redactedId`
 *     (for logs). They are derived from each other via the stable
 *     session hash so a single reading can correlate without
 *     exposing the provider name.
 *
 * Privacy (R1.1): the router never embeds tool names; provider ids
 * are public identifiers (already on the wire in config). The
 * `redactedId` is a derived token, not a leak — the same provider
 * always produces the same redacted id within a session.
 */

import {
	DEFAULT_ROUTER_WEIGHTS,
	type IExternalMcpRouterOptions,
	type IExternalMcpSelection,
	type IExternalMcpRefusal,
	type ProviderHealthState,
	type RedactedProviderId,
} from './types';

export interface IRouterInput {
	readonly providerId: string;
	readonly capabilities: readonly string[];
	readonly cost?: { tokensPer1k?: number; usdPer1k?: number };
	readonly priority?: number;
	readonly health: ProviderHealthState;
	readonly latencyMs: number;
}

export interface IRouterInputEnvelope {
	readonly capability: string;
	readonly providers: readonly IRouterInput[];
	readonly options?: IExternalMcpRouterOptions;
}

/** Deterministic, FNV-1a-ish 32-bit hash. Tiny, no deps, session-stable. */
const fnv1a = (input: string): string => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
};

/** Build the session-stable redacted form of a provider id. */
export const redactProviderId = (providerId: string): RedactedProviderId =>
	`ext-mcp-${fnv1a(providerId)}`;

const HEALTH_PENALTY: Record<ProviderHealthState, number> = {
	healthy: 0,
	degraded: 1,
	down: 5,
};

const resolveWeights = (options: IExternalMcpRouterOptions | undefined) => ({
	...DEFAULT_ROUTER_WEIGHTS,
	...(options?.weights ?? {}),
});

/** Score a single provider. Higher is better. The dimensions are
 *  intentionally additive so the math stays auditable in the test
 *  suite. Pure. */
export const scoreProvider = (
	input: IRouterInput,
	options: IExternalMcpRouterOptions | undefined,
): number => {
	const w = resolveWeights(options);
	const costTokens = input.cost?.tokensPer1k ?? 0;
	const costUsd = input.cost?.usdPer1k ?? 0;
	const costTerm = (costTokens + costUsd * 100) * w.cost;
	const latencyTerm = input.latencyMs * w.latency;
	const healthTerm = HEALTH_PENALTY[input.health] * w.health;
	const priorityTerm = input.priority ?? 0;
	const preferredBonus = options?.preferred?.includes(input.providerId)
		? w.preferredBonus
		: 0;
	// Score = priority + preferredBonus − cost − latency − healthPenalty.
	return priorityTerm + preferredBonus - costTerm - latencyTerm - healthTerm;
};

/**
 * Pick the best provider for `capability`. Pure.
 *
 * Rules:
 *   - Providers whose `capabilities` does not include the target
 *     are filtered out.
 *   - Providers in `options.excluded` are filtered out.
 *   - Among healthy candidates, the highest score wins.
 *   - If every candidate is `down`, we still pick one (so the
 *     caller can surface a refusal with a concrete candidate),
 *     unless the candidate list is empty (then refusal).
 */
export const selectProvider = (
	envelope: IRouterInputEnvelope,
): IExternalMcpSelection | IExternalMcpRefusal => {
	const { capability, providers, options } = envelope;
	const excluded = new Set(options?.excluded ?? []);

	const eligible = providers.filter(
		(provider) =>
			!excluded.has(provider.providerId) &&
			provider.capabilities.includes(capability),
	);

	if (eligible.length === 0) {
		return {
			kind: 'external-mcp-no-provider',
			capability,
			candidates: providers
				.filter((p) => p.capabilities.includes(capability))
				.map((p) => p.providerId),
			reasons: ['no-eligible-provider'],
		};
	}

	const healthy = eligible.filter((p) => p.health === 'healthy');
	const pool = healthy.length > 0 ? healthy : eligible;
	const scored = pool
		.map((p) => ({ input: p, score: scoreProvider(p, options) }))
		.sort((a, b) => b.score - a.score);

	const winner = scored[0];
	if (winner === undefined) {
		return {
			kind: 'external-mcp-no-provider',
			capability,
			candidates: eligible.map((p) => p.providerId),
			reasons: ['no-scored-candidate'],
		};
	}

	const reason: IExternalMcpSelection['reason'] =
		healthy.length === 1
			? 'only-candidate'
			: healthy.length === 0
				? 'failover'
				: options?.preferred?.includes(winner.input.providerId)
					? 'preferred'
					: winner.input.health === 'healthy'
						? 'best-health'
						: 'lowest-cost';

	return {
		kind: 'external-mcp-selection',
		providerId: winner.input.providerId,
		redactedId: redactProviderId(winner.input.providerId),
		capability,
		score: winner.score,
		reason,
		health: winner.input.health,
		latencyMs: winner.input.latencyMs,
	};
};

/**
 * Variant of `selectProvider` that annotates the selection with the
 * reason `best-health` when we deliberately failed over AWAY from a
 * preferred provider that is no longer healthy. Pure.
 *
 * Decision:
 *   1. Run the regular selector.
 *   2. If it returned a refusal, propagate.
 *   3. Find the preferred provider that could have served this
 *      capability (if any).
 *   4. If we picked a NON-preferred winner AND the preferred one is
 *      sick (degraded/down), mark `best-health` — the registry uses
 *      this to emit a "failover" log line.
 *   5. Otherwise return the selection unchanged.
 */
export const selectWithFailover = (
	envelope: IRouterInputEnvelope,
): IExternalMcpSelection | IExternalMcpRefusal => {
	const selection = selectProvider(envelope);
	if (selection.kind === 'external-mcp-no-provider') return selection;

	const preferred = envelope.providers.find(
		(p) =>
			envelope.options?.preferred?.includes(p.providerId) &&
			p.capabilities.includes(envelope.capability) &&
			!envelope.options?.excluded?.includes(p.providerId),
	);
	if (!preferred) return selection;
	if (envelope.options?.preferred?.includes(selection.providerId)) {
		return selection;
	}
	if (preferred.health === 'healthy') return selection;
	// Picked a non-preferred winner while the preferred one is sick
	// → that IS the failover path. Annotate.
	return { ...selection, reason: 'best-health' as const };
};
