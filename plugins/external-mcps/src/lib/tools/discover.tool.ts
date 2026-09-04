/**
 * discover.tool.ts — `<prefix>_discover` (f00068 S5, gate decisions 3 + 5).
 *
 * The ⛔ LIVE tier: a runtime npm-registry search for MCP servers nobody
 * curated. It is the most dangerous surface (the LLM proposes arbitrary
 * `npx` packages), so it is gated three ways:
 *
 * 1. **Off by default.** `allowDiscoverySearch` is `false` unless the user
 *    opts in; while off the tool makes ZERO network calls and returns a
 *    structured opt-in hint (`{ ok:false, code:'discovery-disabled' }`).
 *    The search client is INJECTED so the spec can prove no call happens.
 * 2. **In-memory rate budget.** 10 calls / 10 min per workspace, enforced
 *    with an injectable clock; over budget returns
 *    `{ ok:false, code:'budget-exceeded' }` — again with no network call.
 * 3. **Token-lean.** Max 10 compact rows (`{name, version, description}`),
 *    a `total` count, and the reminder that every candidate still needs a
 *    pinned version, a `validate_config` dry-run, and a human `ack` before
 *    it boots.
 *
 * The tool NEVER writes config and NEVER boots a server — it only reports
 * candidates. Applying anything stays with the suggest → validate → ack
 * chain.
 */
import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

/** Hard cap on rows per call (token-lean mandate). */
export const DISCOVER_MAX_RESULTS = 10;

/** Rate budget: 10 live npm calls per rolling 10-minute window per workspace. */
export const DISCOVER_BUDGET_LIMIT = 10;
export const DISCOVER_BUDGET_WINDOW_MS = 10 * 60 * 1000;

/** Hard bound on the npm-registry search request (matches online-preset.ts). */
export const DISCOVER_FETCH_TIMEOUT_MS = 5_000;

/** One npm-registry search hit, already narrowed to the fields we surface. */
export interface INpmSearchResult {
	readonly name: string;
	readonly version: string;
	readonly description?: string;
}

/**
 * Injectable live-search seam. The default hits the npm registry's
 * `/-/v1/search` endpoint; tests pass a spy so they can assert the OFF
 * path never calls it.
 */
export type INpmSearchClient = (
	query: string,
	limit: number,
) => Promise<readonly INpmSearchResult[]>;

/**
 * Default live client: npm registry `/-/v1/search`. Only ever invoked
 * when `allowDiscoverySearch` is true AND the rate budget allows it.
 */
export const createDefaultNpmSearch = (): INpmSearchClient => {
	return async (query, limit) => {
		const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(
			query,
		)}&size=${limit}`;
		const res = await fetch(url, {
			signal: AbortSignal.timeout(DISCOVER_FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`npm-search-http-${res.status}`);
		}
		const body = (await res.json()) as {
			objects?: ReadonlyArray<{
				package?: {
					name?: unknown;
					version?: unknown;
					description?: unknown;
				};
			}>;
		};
		const results: INpmSearchResult[] = [];
		for (const object of body.objects ?? []) {
			const pkg = object.package;
			if (pkg === undefined) continue;
			if (
				typeof pkg.name !== 'string' ||
				typeof pkg.version !== 'string'
			) {
				continue;
			}
			results.push({
				name: pkg.name,
				version: pkg.version,
				...(typeof pkg.description === 'string'
					? { description: pkg.description }
					: {}),
			});
		}
		return results;
	};
};

/** A rolling-window call budget over an injectable millisecond clock. */
export interface ICallBudget {
	/** Consume one slot; false when the window is already full. */
	tryConsume(): boolean;
	/** Slots left in the current window (after pruning expired hits). */
	remaining(): number;
}

/**
 * Pure in-memory rate budget: at most `limit` consumes per rolling
 * `windowMs`. The clock is injected so the spec can drive time.
 */
export const createCallBudget = (
	limit: number,
	windowMs: number,
	now: () => number,
): ICallBudget => {
	const hits: number[] = [];
	const prune = (at: number): void => {
		const cutoff = at - windowMs;
		while (hits.length > 0 && (hits[0] as number) <= cutoff) hits.shift();
	};
	return {
		tryConsume: () => {
			const at = now();
			prune(at);
			if (hits.length >= limit) return false;
			hits.push(at);
			return true;
		},
		remaining: () => {
			prune(now());
			return Math.max(0, limit - hits.length);
		},
	};
};

export interface IDiscoverToolOptions {
	readonly namespacePrefix: string;
	/** The resolved `allowDiscoverySearch` knob (default false). */
	readonly allowDiscoverySearch: boolean;
	/** Injected live-search seam; defaults to the npm-registry client. */
	readonly search?: INpmSearchClient;
	/** Injected millisecond clock for the rate budget (defaults to Date.now). */
	readonly now?: () => number;
}

const InputSchema = z.object({
	/** Free-text npm search text (e.g. "zig language server"). */
	query: z.string().optional(),
});

const ResultSchema = z.object({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
});

export const DiscoverOutputSchema = z.object({
	ok: z.boolean(),
	/** Present on a gated response: 'discovery-disabled' | 'budget-exceeded'. */
	code: z.string().optional(),
	/** Actionable one-liner on the gated paths. */
	hint: z.string().optional(),
	/** TOTAL live matches (may exceed the ≤10 returned rows). */
	total: z.number().int().nonnegative().optional(),
	results: z.array(ResultSchema).max(DISCOVER_MAX_RESULTS).optional(),
	/** Remaining live-search budget in the current window. */
	budget: z
		.object({
			remaining: z.number().int().nonnegative(),
			limit: z.number().int().positive(),
			windowMinutes: z.number().int().positive(),
		})
		.optional(),
});

const WINDOW_MINUTES = DISCOVER_BUDGET_WINDOW_MS / 60_000;

const compactResult = (result: INpmSearchResult): Record<string, unknown> => ({
	name: result.name,
	version: result.version,
	...(result.description !== undefined
		? { description: result.description.slice(0, 120) }
		: {}),
});

export const buildDiscoverToolRegistration = (
	options: IDiscoverToolOptions,
): IToolRegistration => ({
	id: 'discover',
	tags: ['external-mcps', 'lazy', 'discovery'],
	effects: ['network'],
	summary:
		'Live npm search for external MCP servers — OFF unless allowDiscoverySearch is enabled.',
	descriptionKey: 'mcp-vertex_external-mcps_discover',
	register: async (server) => {
		const search = options.search ?? createDefaultNpmSearch();
		const now = options.now ?? (() => Date.now());
		// One budget per registration = per workspace host process.
		const budget = createCallBudget(
			DISCOVER_BUDGET_LIMIT,
			DISCOVER_BUDGET_WINDOW_MS,
			now,
		);
		server.registerTool(
			`${options.namespacePrefix}_discover`,
			{
				description:
					'Search the LIVE npm registry for external MCP servers that are not in the curated/discoverable catalog. This is the ⛔ live tier and is OFF by default: while `allowDiscoverySearch` is false it makes ZERO network calls and returns `{ ok:false, code:"discovery-disabled" }` with an opt-in hint. When enabled it returns up to 10 compact `{name, version, description}` rows plus a `total`, and enforces a 10 calls / 10 min budget. Every candidate still needs a pinned version, a `validate_config` dry-run, and a human `ack` before it boots — this tool never writes config and never spawns a server.',
				inputSchema: InputSchema,
				outputSchema: DiscoverOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				// Gate 1 — kill switch. NO network call while off.
				if (!options.allowDiscoverySearch) {
					return toolJson({
						ok: false,
						code: 'discovery-disabled',
						hint: 'Live npm discovery is off. Set plugins.external-mcps.options.allowDiscoverySearch to true to opt in; the curated + discoverable catalog stays available offline via the catalog tool.',
					});
				}
				const query = args.query?.trim() ?? '';
				if (query === '') {
					return toolError(
						'invalid-args: pass { query } — a free-text npm search string',
					);
				}
				// Gate 2 — rate budget. NO network call when over budget.
				if (!budget.tryConsume()) {
					return toolJson({
						ok: false,
						code: 'budget-exceeded',
						hint: `Live-search budget spent (${DISCOVER_BUDGET_LIMIT} calls / ${WINDOW_MINUTES} min). Wait for the window to roll over or restart the host.`,
						budget: {
							remaining: 0,
							limit: DISCOVER_BUDGET_LIMIT,
							windowMinutes: WINDOW_MINUTES,
						},
					});
				}
				let raw: readonly INpmSearchResult[];
				try {
					raw = await search(query, DISCOVER_MAX_RESULTS);
				} catch (err) {
					return toolError(
						`discovery-failed: ${err instanceof Error ? err.message : String(err)}`,
						'Retry with a narrower query, or browse the offline catalog tool instead.',
					);
				}
				return toolJson({
					ok: true,
					total: raw.length,
					results: raw
						.slice(0, DISCOVER_MAX_RESULTS)
						.map(compactResult),
					budget: {
						remaining: budget.remaining(),
						limit: DISCOVER_BUDGET_LIMIT,
						windowMinutes: WINDOW_MINUTES,
					},
				});
			},
		);
	},
});
