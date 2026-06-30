/**
 * gc-tool.ts — `<prefix>_cache_gc`: preview (dry-run) or apply the
 * cache eviction rules contributed to the shared core registry.
 *
 * - Default `dryRun: true` — matches the repo's "preview first" posture
 *   (`audit_plan`, `proposals_reconcile`). The empty-input probe in
 *   `verify:tools` therefore runs a SAFE dry-run that deletes nothing.
 * - `onlyOwner` scopes the run to a single contributing plugin
 *   (`cache`, `logs`, `memory`, `notification`, …), useful for
 *   targeted sweeps and plugin-local tests.
 *
 * The tool closes over the registry the plugin received from
 * `ctx.cacheEvictionRegistry`. When the host did not supply one (the
 * field is optional on the contract for legacy fixtures), the tool
 * returns a structured error instead of throwing.
 */
import {
	toolError,
	toolJson,
	type ICacheEvictionRegistry,
	type IToolRegistration,
	type IToolTextResult,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

const GcInputSchema = z.object({
	/** When false, actually delete; default true (preview only). */
	dryRun: z.boolean().optional(),
	/** Limit the run to a single contributing plugin (owner tag). */
	onlyOwner: z.string().min(1).optional(),
});

const RemovedSchema = z.object({
	id: z.string(),
	path: z.string(),
	bytes: z.number(),
});

const GcOutputSchema = z.object({
	dryRun: z.boolean(),
	appliedAt: z.string(),
	totalBytes: z.number(),
	rulesEvaluated: z.number(),
	removed: z.array(RemovedSchema),
	skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
	errors: z.array(
		z.object({ id: z.string(), path: z.string(), error: z.string() }),
	),
});

export interface IGcToolOptions {
	readonly namespacePrefix: string;
	/**
	 * The shared eviction registry from `ctx.cacheEvictionRegistry`.
	 * Optional: a legacy host that built the plugin context by hand may
	 * omit it, in which case the tool reports a structured error.
	 */
	readonly registry?: ICacheEvictionRegistry | undefined;
}

/**
 * `<prefix>_cache_gc { dryRun?, onlyOwner? }` — run the registry and
 * return the {@link ICacheEvictionReport}.
 */
export const buildGcRegistration = (
	options: IGcToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'cache_gc',
		summary:
			'Preview (dry-run) or apply cache eviction across every registered rule.',
		tags: ['cache', 'maintenance'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_cache_gc`,
				{
					description:
						'Run the cache eviction registry over `.cache/mcp-vertex`. Default `dryRun: true` returns the report of what WOULD be removed; `dryRun: false` actually deletes and shrinks the cache. `onlyOwner` scopes the run to one contributing plugin. Idempotent: a second apply is a no-op.',
					inputSchema: GcInputSchema,
					outputSchema: GcOutputSchema,
				},
				async (args: {
					dryRun?: boolean | undefined;
					onlyOwner?: string | undefined;
				}): Promise<IToolTextResult> => {
					if (options.registry === undefined) {
						return toolError(
							'cache eviction registry unavailable',
							'the host did not supply ctx.cacheEvictionRegistry; cache_gc cannot run',
						);
					}
					const dryRun = args.dryRun ?? true;
					const report = await options.registry.run({
						dryRun,
						...(args.onlyOwner !== undefined
							? { onlyOwner: args.onlyOwner }
							: {}),
					});
					return toolJson(report);
				},
			);
		},
	};
};
