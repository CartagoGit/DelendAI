/**
 * external-mcp/registry.ts — f00193 (Track K / external MCPs).
 *
 * The registry is the runtime side of the control plane: it owns
 * the lifecycle of `IExternalMcpProvider` instances (lazy connect,
 * background health, eviction) and exposes a small, immutable
 * snapshot for the router to consume.
 *
 * Design notes (SRP + DIP):
 *   - The registry depends on the abstract `IExternalMcpProvider`
 *     (data + factory methods), NOT on any concrete transport
 *     (stdio/http). Tests inject `connect()` stubs.
 *   - The router takes an `IRouterInputEnvelope` (pure data); the
 *     registry builds that envelope by snapshotting the providers
 *     + their last health probe. The registry owns no scoring
 *     logic.
 *   - `evict(providerId)` tears down the connection AND clears the
 *     probe cache; the router will refuse to select the provider
 *     afterwards because the envelope won't include it.
 *
 * Privacy (R1.1, R1.6, R1.9): the registry never logs tool names.
 * Provider ids are public; probe reasons are redacted to short
 * opaque strings before being placed on the snapshot.
 */

import type {
	IExternalMcpConnection,
	IExternalMcpHealth,
	IExternalMcpProvider,
	ProviderHealthState,
} from './types';
import { probeProvider, type IClassifyHealthOptions } from './health';
import { redactProviderId, type IRouterInput, scoreProvider } from './router';

export interface IRegistryOptions {
	/** How often the background probe runs. 0 = disabled. */
	readonly healthCheckIntervalMs?: number;
	/** Forwarded to `classifyHealth`. */
	readonly healthThresholds?: IClassifyHealthOptions;
	/** When true, calls to `select()` are logged with the redacted id. */
	readonly traceSelections?: boolean;
}

export interface IRegisteredProviderSnapshot {
	readonly providerId: string;
	readonly redactedId: string;
	readonly capabilities: readonly string[];
	readonly cost?: { tokensPer1k?: number; usdPer1k?: number };
	readonly priority?: number;
	readonly health: ProviderHealthState;
	readonly latencyMs: number;
	readonly lastProbeAt: string | null;
}

interface IInternalEntry {
	readonly provider: IExternalMcpProvider;
	connection: IExternalMcpConnection | null;
	health: ProviderHealthState;
	latencyMs: number;
	lastProbeAt: string | null;
}

/**
 * Pure helper: redact the optional `reason` field so we never
 * leak tool names into the router envelope. Order of operations:
 *   1. Replace tool-name-like tokens (`<word>.<word>`, e.g.
 *      `acme.sendMessage`) with `<tool>` — the heuristic is two
 *      identifier segments joined by a dot, both with at least one
 *      letter; covers the common MCP `vendor.tool` pattern.
 *   2. Strip URLs (replaced with `<url>`) so the truncation can
 *      never leak a path-bearing URL fragment.
 *   3. Collapse whitespace.
 *   4. Truncate to 60 chars.
 *   5. Trim.
 *
 * Privacy R1.1: tool names are NEVER logged in clear.
 */
const sanitizeReason = (reason: string | undefined): string | undefined => {
	if (reason === undefined) return undefined;
	const noTool = reason.replace(
		/\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b/g,
		'<tool>',
	);
	const noUrl = noTool.replace(/https?:\/\/\S+/g, '<url>');
	const collapsed = noUrl.replace(/\s+/g, ' ').trim();
	if (collapsed.length > 60) return `${collapsed.slice(0, 57)}...`;
	return collapsed;
};

export class ExternalMcpRegistry {
	private readonly entries = new Map<string, IInternalEntry>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly trace: boolean;

	constructor(private readonly options: IRegistryOptions = {}) {
		this.trace = options.traceSelections ?? false;
	}

	/** Register a provider. Lazy: does not call `connect()`. */
	register(provider: IExternalMcpProvider): void {
		if (this.entries.has(provider.id)) {
			throw new Error(`provider already registered: ${provider.id}`);
		}
		this.entries.set(provider.id, {
			provider,
			connection: null,
			health: 'down',
			latencyMs: 0,
			lastProbeAt: null,
		});
	}

	/** Unregister + close the connection (if any). */
	async evict(providerId: string): Promise<void> {
		const entry = this.entries.get(providerId);
		if (!entry) return;
		this.entries.delete(providerId);
		if (entry.connection) {
			try {
				await entry.connection.close();
			} catch {
				// Eviction must never throw; the entry is gone either way.
			}
		}
	}

	/** Snapshot the live state for the router. Pure (no I/O). */
	snapshot(): readonly IRegisteredProviderSnapshot[] {
		return [...this.entries.values()].map((entry) => ({
			providerId: entry.provider.id,
			redactedId: redactProviderId(entry.provider.id),
			capabilities: entry.provider.capabilities,
			...(entry.provider.cost !== undefined
				? { cost: entry.provider.cost }
				: {}),
			...(entry.provider.priority !== undefined
				? { priority: entry.provider.priority }
				: {}),
			health: entry.health,
			latencyMs: entry.latencyMs,
			lastProbeAt: entry.lastProbeAt,
		}));
	}

	/** Build a router envelope from the snapshot. Pure. */
	toRouterInput(): readonly IRouterInput[] {
		return this.snapshot().map((entry) => ({
			providerId: entry.providerId,
			capabilities: entry.capabilities,
			...(entry.cost !== undefined ? { cost: entry.cost } : {}),
			...(entry.priority !== undefined
				? { priority: entry.priority }
				: {}),
			health: entry.health,
			latencyMs: entry.latencyMs,
		}));
	}

	/** Get a registered provider's connection, opening it if needed. */
	async connect(providerId: string): Promise<IExternalMcpConnection> {
		const entry = this.entries.get(providerId);
		if (!entry) throw new Error(`provider not registered: ${providerId}`);
		if (entry.connection) return entry.connection;
		const connection = await entry.provider.connect();
		entry.connection = connection;
		return connection;
	}

	/** Run health probes on every provider; update the snapshot. */
	async probeAll(): Promise<void> {
		const promises = [...this.entries.values()].map(async (entry) => {
			const { state, probe } = await probeProvider(entry.provider, {
				...(this.options.healthThresholds ?? {}),
			});
			entry.health = state;
			entry.latencyMs = probe.latencyMs;
			entry.lastProbeAt = probe.checkedAt;
		});
		await Promise.all(promises);
	}

	/** Start the background probe loop. */
	start(): void {
		if (this.timer !== null) return;
		const ms = this.options.healthCheckIntervalMs ?? 60_000;
		if (ms <= 0) return;
		this.timer = setInterval(() => {
			void this.probeAll();
		}, ms);
		// Don't keep the Node event loop alive just for the probe.
		if (
			typeof this.timer === 'object' &&
			this.timer !== null &&
			'unref' in this.timer
		) {
			(this.timer as { unref?: () => void }).unref?.();
		}
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** Number of registered providers (test helper). */
	get size(): number {
		return this.entries.size;
	}

	/** Whether the trace mode is enabled (test helper). */
	get isTracing(): boolean {
		return this.trace;
	}

	/**
	 * Look up the redacted id for a provider without touching the
	 * snapshot. Useful for tests + log assertions.
	 */
	publicRedact(providerId: string): string {
		return redactProviderId(providerId);
	}

	/**
	 * Run a probe on a single provider and return its redacted
	 * health result. Used by the router when it needs to refresh
	 * the live state mid-selection.
	 */
	async refreshProvider(providerId: string): Promise<{
		readonly state: ProviderHealthState;
		readonly redactedId: string;
		readonly latencyMs: number;
		readonly reason?: string;
	} | null> {
		const entry = this.entries.get(providerId);
		if (!entry) return null;
		const { state, probe } = await probeProvider(entry.provider, {
			...(this.options.healthThresholds ?? {}),
		});
		entry.health = state;
		entry.latencyMs = probe.latencyMs;
		entry.lastProbeAt = probe.checkedAt;
		const reason = sanitizeReason(probe.reason);
		return {
			state,
			redactedId: redactProviderId(providerId),
			latencyMs: probe.latencyMs,
			...(reason !== undefined ? { reason } : {}),
		};
	}
}

/** Format a registry snapshot as a single-line audit entry. Pure. */
export const formatRegistrySnapshot = (
	snapshot: readonly IRegisteredProviderSnapshot[],
): string =>
	snapshot
		.map((entry) => {
			const cost =
				entry.cost?.tokensPer1k !== undefined
					? ` cost=${entry.cost.tokensPer1k}/1k`
					: '';
			return `${entry.redactedId}[${entry.health}, ${entry.latencyMs}ms${cost}]`;
		})
		.join(' | ');

/**
 * Score every provider in the snapshot. Pure; the router uses the
 * same `scoreProvider` but tests want direct access too.
 */
export const scoreAll = (
	snapshot: readonly IRouterInput[],
): Readonly<Record<string, number>> => {
	const out: Record<string, number> = {};
	for (const entry of snapshot) {
		out[entry.providerId] = scoreProvider(entry, undefined);
	}
	return Object.freeze(out);
};

/** Format an unknown probe reason safely for log output. Re-export
 *  so log consumers do not need to import the private helper. */
export const sanitizeProbeReason = sanitizeReason;

/** Re-export for tests so they can stub a single method. */
export type { IExternalMcpHealth };
