/**
 * pricing.ts — model price table with a stale-while-revalidate refresh.
 *
 * CRITICAL I6 fix: the LiteLLM table is fetched with a HARD 1s timeout and
 * NEVER on the tool hot path. Cost is only computed at flush/rollup time,
 * and even then `resolvePricing` returns whatever is already on disk (or
 * the bundled `resources/pricing.snapshot.json`) immediately, kicking off
 * a background refresh only when the 24h TTL has lapsed. If the network is
 * down, the bundled snapshot is authoritative — tool execution is never
 * blocked or failed by a pricing miss.
 *
 * CRITICAL N4 fix: subscription providers have NO meaningful per-call
 * price (Opus on a Max plan is marginal-cost $0). Their pricing entry is
 * `{kind:'subscription', subscriptionUsd, marginalCostUsd:null, fixedCost:true}`
 * and `computeCostUsd` returns `null` for them — we never fabricate a
 * per-call figure.
 */
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	redactSecrets,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

import type { IUsageTokens } from './types';

export const LITELLM_PRICING_URL =
	'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/** 24h TTL between background refreshes of the on-disk cache. */
export const PRICING_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard cap on the network fetch so it can never block a flush. */
export const PRICING_FETCH_TIMEOUT_MS = 1000;

/** A per-token price entry, or a subscription marker (N4). */
export type IPricingEntry =
	| {
			readonly kind: 'api';
			readonly inputCostPer1k: number;
			readonly outputCostPer1k: number;
			readonly contextWindow?: number;
	  }
	| {
			readonly kind: 'subscription';
			readonly subscriptionUsd: number;
			readonly marginalCostUsd: null;
			readonly fixedCost: true;
	  };

export interface IPricingTable {
	readonly updatedAt: string;
	readonly source: string;
	readonly models: Readonly<Record<string, IPricingEntry>>;
}

/**
 * Compute the fiat cost of a single call from a price entry + reported
 * usage. Returns `null` when the model is unknown, usage is absent, or the
 * provider is a subscription (N4 — no fabricated per-call price).
 */
export const computeCostUsd = (
	table: IPricingTable,
	modelId: string | undefined,
	usage: IUsageTokens | null | undefined,
): number | null => {
	if (!modelId || !usage) return null;
	const entry = table.models[modelId];
	if (!entry || entry.kind === 'subscription') return null;
	const input = usage.inputTokens ?? 0;
	const output = usage.outputTokens ?? 0;
	if (input === 0 && output === 0) return null;
	const cost =
		(input / 1000) * entry.inputCostPer1k +
		(output / 1000) * entry.outputCostPer1k;
	return Number.isFinite(cost) ? cost : null;
};

const SNAPSHOT_URL = new URL(
	'../../resources/pricing.snapshot.json',
	import.meta.url,
);

/** Read the bundled snapshot that ships with the plugin. */
export const readBundledSnapshot = async (): Promise<IPricingTable> => {
	const snapshotPath = fileURLToPath(SNAPSHOT_URL);
	const raw = (
		await new SafeWorkspaceReader(dirname(snapshotPath)).readText(
			basename(snapshotPath),
		)
	).content;
	return JSON.parse(raw) as IPricingTable;
};

const parseTable = (raw: string): IPricingTable | null => {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof (parsed as IPricingTable).models === 'object'
		) {
			return parsed as IPricingTable;
		}
	} catch {
		// fall through
	}
	return null;
};

/** Read the cached `pricing.json` if it exists and parses; else null. */
export const readPricingCache = async (
	absPath: string,
): Promise<IPricingTable | null> => {
	try {
		return parseTable(
			(
				await new SafeWorkspaceReader(dirname(absPath)).readText(
					basename(absPath),
				)
			).content,
		);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		return null;
	}
};

const isStale = (table: IPricingTable, now: number): boolean => {
	const updated = Date.parse(table.updatedAt);
	return Number.isNaN(updated) || now - updated >= PRICING_TTL_MS;
};

/**
 * Fetch the LiteLLM table with a hard timeout. Returns null on any error
 * (offline, timeout, malformed) — the caller keeps the snapshot/cache. The
 * upstream shape is `{ "<model>": { input_cost_per_token, output_cost_per_token, ... } }`.
 */
export const fetchLiteLlmPricing = async (
	url: string = LITELLM_PRICING_URL,
	timeoutMs: number = PRICING_FETCH_TIMEOUT_MS,
): Promise<IPricingTable | null> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) return null;
		const upstream = (await res.json()) as Record<
			string,
			{
				input_cost_per_token?: number;
				output_cost_per_token?: number;
				max_input_tokens?: number;
			}
		>;
		const models: Record<string, IPricingEntry> = {};
		for (const [modelId, spec] of Object.entries(upstream)) {
			if (
				typeof spec?.input_cost_per_token !== 'number' ||
				typeof spec?.output_cost_per_token !== 'number'
			) {
				continue;
			}
			models[modelId] = {
				kind: 'api',
				inputCostPer1k: spec.input_cost_per_token * 1000,
				outputCostPer1k: spec.output_cost_per_token * 1000,
				...(typeof spec.max_input_tokens === 'number'
					? { contextWindow: spec.max_input_tokens }
					: {}),
			};
		}
		return {
			updatedAt: new Date().toISOString(),
			source: url,
			models,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
};

/** Persist a pricing table durably (mutex + atomic + redact — rules 4/6). */
export const writePricingCache = async (
	absPath: string,
	table: IPricingTable,
): Promise<void> => {
	const { text } = redactSecrets(`${JSON.stringify(table, null, '\t')}\n`);
	await withFileMutex(absPath, () => writeFileAtomic(absPath, text));
};

export interface IResolvePricingDeps {
	readonly now?: () => number;
	readonly fetchImpl?: typeof fetchLiteLlmPricing;
	/**
	 * Receives the in-flight background refresh so a caller can observe it
	 * — a host awaiting it on shutdown so the write is not lost mid-flush,
	 * or a test awaiting it instead of sleeping and hoping. Never called
	 * when the cache is fresh enough that no refresh is triggered.
	 */
	readonly onBackgroundRefresh?: (refresh: Promise<void>) => void;
}

/**
 * Stale-while-revalidate resolver. Returns the freshest table available
 * WITHOUT blocking on the network:
 *   1. on-disk cache if present (fresh or stale),
 *   2. else the bundled snapshot.
 * When the returned table is stale (or was the snapshot), a background
 * refresh is triggered (fire-and-forget) that writes `pricing.json` for
 * the next boot. The returned promise resolves as soon as a table is in
 * hand — it never awaits the fetch.
 */
export const resolvePricing = async (
	cachePath: string,
	deps: IResolvePricingDeps = {},
): Promise<IPricingTable> => {
	const now = deps.now ?? (() => Date.now());
	const fetchImpl = deps.fetchImpl ?? fetchLiteLlmPricing;

	const cache = await readPricingCache(cachePath);
	const current = cache ?? (await readBundledSnapshot());

	if (cache === null || isStale(current, now())) {
		// Never awaited on the hot path — but handed to the caller so the
		// refresh is observable rather than merely fire-and-forget.
		const refresh = (async () => {
			const fresh = await fetchImpl();
			if (fresh)
				await writePricingCache(cachePath, fresh).catch(
					() => undefined,
				);
		})();
		deps.onBackgroundRefresh?.(refresh);
		void refresh;
	}

	return current;
};
