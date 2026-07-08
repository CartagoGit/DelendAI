/**
 * catalog.tool.ts — `<prefix>_catalog` (f00068 S1, gate decisions 1 + 2).
 *
 * The ONLY discovery surface for the seed catalog — nothing rides in the
 * system prompt (token-lean mandate). Compact by default: each match is
 * `{id, category, summary}` (~15 tokens), capped at 10 rows with a
 * `total` count so the LLM can narrow the `query` instead of paging.
 * `detail: '<id>'` returns ONE full entry (tier, install recipe with a
 * pinned example, env var NAMES). Pure and read-only: the tool never
 * touches the network, the filesystem or the config.
 */
import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import {
	CATALOG_CATEGORIES,
	FULL_CATALOG,
	type ICatalogEntry,
} from '../catalog/catalog-data';

/** Hard cap on compact matches per call (gate decision 2). */
export const MAX_CATALOG_MATCHES = 10;

export interface ICatalogToolOptions {
	readonly namespacePrefix: string;
}

const InputSchema = z.object({
	/** Case-insensitive substring filter over id, category and summary. */
	query: z.string().optional(),
	/** Return the ONE full entry for this catalog id instead of a list. */
	detail: z.string().optional(),
});

const CategorySchema = z.enum(CATALOG_CATEGORIES);

const CompactEntrySchema = z.object({
	id: z.string(),
	category: CategorySchema,
	summary: z.string(),
});

const FullEntrySchema = z.object({
	id: z.string(),
	tier: z.enum(['curated', 'discoverable']),
	category: CategorySchema,
	summary: z.string(),
	install: z.object({
		command: z.string(),
		args: z.array(z.string()),
		pinExample: z.string(),
	}),
	envVars: z.array(z.string()).optional(),
});

export const CatalogOutputSchema = z.object({
	ok: z.literal(true),
	mode: z.enum(['list', 'detail']),
	/** In list mode: TOTAL matches (may exceed the 10 returned rows). */
	total: z.number().int().nonnegative(),
	entries: z.array(CompactEntrySchema).max(MAX_CATALOG_MATCHES).optional(),
	entry: FullEntrySchema.optional(),
});

/** Pure filter: substring match on id/category/summary (case-insensitive). */
export const filterCatalog = (query?: string): readonly ICatalogEntry[] => {
	const q = query?.trim().toLowerCase() ?? '';
	if (q === '') return FULL_CATALOG;
	return FULL_CATALOG.filter(
		(entry) =>
			entry.id.includes(q) ||
			entry.category.includes(q) ||
			entry.summary.toLowerCase().includes(q),
	);
};

/** Compact projection — EXACTLY the three fields, nothing else. */
export const toCompactEntry = (
	entry: ICatalogEntry,
): { id: string; category: string; summary: string } => ({
	id: entry.id,
	category: entry.category,
	summary: entry.summary,
});

const toFullEntry = (entry: ICatalogEntry): Record<string, unknown> => ({
	id: entry.id,
	tier: entry.tier,
	category: entry.category,
	summary: entry.summary,
	install: {
		command: entry.install.command,
		args: [...entry.install.args],
		pinExample: entry.install.pinExample,
	},
	...(entry.envVars !== undefined ? { envVars: [...entry.envVars] } : {}),
});

export const buildCatalogToolRegistration = (
	options: ICatalogToolOptions,
): IToolRegistration => ({
	id: 'catalog',
	tags: ['external-mcps', 'lazy', 'catalog'],
	summary:
		'Search the external MCP server catalog (compact id+category+one-liner rows; detail per id).',
	descriptionKey: 'mcp-vertex_external-mcps_catalog',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_catalog`,
			{
				description:
					'Search the curated + discoverable catalog of composable third-party MCP servers. Compact by default: up to 10 {id, category, summary} rows plus a `total` count — narrow `query` (substring over id/category/summary) when total exceeds 10. Pass `detail: "<id>"` for ONE full entry (tier, install command/args with a pinned version example, required env var NAMES). Read-only and offline: nothing here boots a server or calls the network.',
				inputSchema: InputSchema,
				outputSchema: CatalogOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const detailId = args.detail?.trim().toLowerCase() ?? '';
				if (detailId !== '') {
					const entry = FULL_CATALOG.find((e) => e.id === detailId);
					if (entry === undefined) {
						return toolError(
							`unknown-catalog-id: "${args.detail}"`,
							'Call the catalog without `detail` (optionally with `query`) to list valid ids.',
						);
					}
					return toolJson({
						ok: true,
						mode: 'detail',
						total: 1,
						entry: toFullEntry(entry),
					});
				}
				const matches = filterCatalog(args.query);
				return toolJson({
					ok: true,
					mode: 'list',
					total: matches.length,
					entries: matches
						.slice(0, MAX_CATALOG_MATCHES)
						.map(toCompactEntry),
				});
			},
		);
	},
});
