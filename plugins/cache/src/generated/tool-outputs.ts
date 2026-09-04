/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface DelendaiCacheCacheGcOutput {
	dryRun: boolean;
	appliedAt: string;
	totalBytes: number;
	rulesEvaluated: number;
	removed: {
		id: string;
		path: string;
		bytes: number;
	}[];
	skipped: {
		id: string;
		reason: string;
	}[];
	errors: {
		id: string;
		path: string;
		error: string;
	}[];
}

export interface DelendaiCacheReconcileOutput {
	cacheDirAbs: string;
	created: string[];
	migrated: {
		from: string;
		to: string;
	}[];
	pending: {
		from: string;
		to: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface CacheToolOutputs {
	"delendai_cache_cache_gc": DelendaiCacheCacheGcOutput;
	"delendai_cache_reconcile": DelendaiCacheReconcileOutput;
}
