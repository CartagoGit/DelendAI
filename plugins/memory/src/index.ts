import { basename, dirname } from 'node:path';

import { definePlugin, joinRel } from '@mcp-vertex/core/public';
import z from 'zod';

import { expireExpiredNotes } from './lib/services/store';
import { buildMemoryToolRegistrations } from './lib/tools';
import {
	DEFAULT_CHECKPOINT_MAX_AGE_MS,
	readStoreMtimeMs,
	refreshCheckpointFreshnessAdvisory,
} from './lib/services/checkpoint-freshness';
import { SESSION_DIGEST_TITLE_PREFIX } from './lib/contracts/constants/session-digest.constant';
import { createFreshnessDebouncer } from './lib/services/freshness-debounce';
import { createStoreWatcher } from './lib/services/store-watcher';
import type { ICheckpointAdvisory } from '@mcp-vertex/core/public';

const MAX_TITLE_WEIGHT = 10;
const FRESHNESS_DEBOUNCE_WAIT_MS = 250;

const OptionsSchema = z
	.object({
		/**
		 * BM25 `k1` parameter — term-frequency saturation. Lower values
		 * give more weight to a single occurrence; higher values flatten
		 * the curve (more occurrences keep adding relevance). Default 1.5
		 * (the classic Robertson/Zaragoza BM25 value).
		 */
		bm25K1: z.number().min(0).max(3).optional(),
		/**
		 * BM25 `b` parameter — document-length normalisation. 0 = ignore
		 * length (long and short notes rank equally); 1 = full length
		 * normalisation. Default 0.75.
		 */
		bm25B: z.number().min(0).max(1).optional(),
		/**
		 * Weight of title tokens in the BM25 corpus. Each title token is
		 * counted `titleWeight` times, so this is effectively a multiplier
		 * on title relevance vs body relevance. Default 2.
		 */
		titleWeight: z.number().int().min(1).max(MAX_TITLE_WEIGHT).optional(),
		/**
		 * Maximum number of notes the store keeps on disk. Once the
		 * store is full, `memory_save` rejects new notes with a clear
		 * error (no silent eviction). Default 1000.
		 */
		maxNotes: z.number().int().min(1).max(100_000).optional(),
	})
	.strict();

/**
 * Default values for {@link OptionsSchema}. Kept as a single object so
 * the knowledge entry and the `register` function agree on the same
 * fallback values without risk of drift.
 */
const DEFAULT_OPTIONS = {
	bm25K1: 1.5,
	bm25B: 0.75,
	titleWeight: 2,
	maxNotes: 1000,
} as const;

/**
 * Persistent project memory. Save/recall/list/forget small notes stored
 * in one JSON file under the cache dir, so any agent keeps continuity
 * across sessions with minimal tokens. Load with `mcp-vertex --plugins=memory`.
 */
export default definePlugin({
	name: 'memory',
	version: '0.1.1',
	describe:
		'Persistent project notes (save/recall/list/forget) for cross-session continuity with minimal tokens.',
	// Accumulated knowledge, not derivable cache — deleting it is amnesia,
	// not a rebuild. See IMcpPlugin#cacheNamespace.
	cacheNamespace: 'results',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const optionsResult = OptionsSchema.safeParse(ctx.options);
		const pluginOptions = optionsResult.success ? optionsResult.data : {};
		const bm25K1 = pluginOptions.bm25K1 ?? DEFAULT_OPTIONS.bm25K1;
		const bm25B = pluginOptions.bm25B ?? DEFAULT_OPTIONS.bm25B;
		const titleWeight =
			pluginOptions.titleWeight ?? DEFAULT_OPTIONS.titleWeight;
		const maxNotes = pluginOptions.maxNotes ?? DEFAULT_OPTIONS.maxNotes;
		const storePathAbs = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'notes.json'),
		);

		// f00072 S4: register the per-note TTL sweep as a `custom` rule
		// against the shared cache-eviction registry. `readStore` already
		// drops expired notes lazily on read, but they linger on disk
		// until the next write; this rule prunes them durably on the boot
		// sweep / `cache_gc`. The custom runner honours the registry's
		// dryRun flag, so a dry-run reports the would-be removals without
		// touching the store. Additive: no behaviour change for the
		// existing tools, and a no-op when no registry is supplied.
		// The plugin's private cache dir is `<cacheDir>/memory` (keyed by
		// the plugin NAME, not the namespace prefix), so the store's
		// cache-relative path is `memory/notes.json`. The custom runner
		// operates on the resolved `storePathAbs` directly; `path` is used
		// for containment validation + the eviction report.
		ctx.cacheEvictionRegistry?.register({
			id: 'memory-expired',
			owner: 'memory',
			path: 'memory/notes.json',
			when: {
				kind: 'custom',
				run: async (_targetAbs, dryRun) =>
					expireExpiredNotes(storePathAbs, { dryRun }),
			},
		});

		let lastFreshnessAdvisory: ICheckpointAdvisory | null = null;
		let lastStoreMtimeMs: number | null = null;
		const refreshFreshnessAdvisory = async (): Promise<void> => {
			try {
				const refreshed = await refreshCheckpointFreshnessAdvisory(
					storePathAbs,
					{
						nowMs: Date.now(),
						maxAgeMs: DEFAULT_CHECKPOINT_MAX_AGE_MS,
					},
				);
				lastFreshnessAdvisory = refreshed.advisory;
				lastStoreMtimeMs = refreshed.mtimeMs;
			} catch {
				// Store missing/corrupt: do not invent an advisory.
			}
		};
		const freshnessDebouncer = createFreshnessDebouncer(
			refreshFreshnessAdvisory,
			{ waitMs: FRESHNESS_DEBOUNCE_WAIT_MS },
		);

		const scheduleIfStoreMtimeChanged = async (): Promise<void> => {
			const currentMtimeMs = await readStoreMtimeMs(storePathAbs);
			if (currentMtimeMs === lastStoreMtimeMs) return;
			lastStoreMtimeMs = currentMtimeMs;
			freshnessDebouncer.schedule();
		};

		const storeWatcher = createStoreWatcher({
			dir: dirname(storePathAbs),
			fileName: basename(storePathAbs),
			onChange: () => {
				void scheduleIfStoreMtimeChanged();
			},
		});
		void refreshFreshnessAdvisory();

		const isTool = (toolName: string, toolId: string): boolean =>
			toolName === `${ctx.namespacePrefix}_${toolId}` ||
			toolName.endsWith(`_${ctx.namespacePrefix}_${toolId}`);

		const isToolErrorResult = (result: unknown): boolean =>
			typeof result === 'object' &&
			result !== null &&
			(result as { isError?: unknown }).isError === true;

		const parseToolPayload = (
			result: unknown,
		): Record<string, unknown> | null => {
			if (typeof result !== 'object' || result === null) return null;
			const content = (result as { content?: unknown }).content;
			if (!Array.isArray(content) || content.length === 0) return null;
			const text = (content[0] as { text?: unknown } | undefined)?.text;
			if (typeof text !== 'string') return null;
			try {
				const parsed = JSON.parse(text) as unknown;
				return typeof parsed === 'object' && parsed !== null
					? (parsed as Record<string, unknown>)
					: null;
			} catch {
				return null;
			}
		};

		const shouldRefreshForMutationEvent = (
			toolName: string,
			result: unknown,
		): boolean => {
			if (isToolErrorResult(result)) return false;
			return (
				isTool(toolName, 'save') ||
				isTool(toolName, 'forget') ||
				isTool(toolName, 'import')
			);
		};

		const shouldRefreshForCheckpointEvent = (
			toolName: string,
			args: unknown,
			result: unknown,
		): boolean => {
			if (isToolErrorResult(result)) return false;
			if (isTool(toolName, 'compact')) {
				return parseToolPayload(result)?.persisted === true;
			}
			if (!isTool(toolName, 'save')) return false;
			const title = (args as { title?: unknown } | null)?.title;
			return (
				typeof title === 'string' &&
				title.startsWith(SESSION_DIGEST_TITLE_PREFIX)
			);
		};

		return {
			tools: buildMemoryToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				storePathAbs,
				bm25K1,
				bm25B,
				titleWeight,
				maxNotes,
			}),
			onToolCall: (toolName, args, result) => {
				if (shouldRefreshForCheckpointEvent(toolName, args, result)) {
					freshnessDebouncer.schedule();
					return;
				}
				if (shouldRefreshForMutationEvent(toolName, result)) {
					freshnessDebouncer.schedule();
				}
			},
			getCheckpointAdvisory: () => lastFreshnessAdvisory,
			dispose: () => {
				storeWatcher.dispose();
				freshnessDebouncer.cancel();
			},
			knowledge: [
				{
					id: 'memory-usage',
					title: 'Project memory',
					body: [
						'# Project memory',
						'',
						`Tools: \`${ctx.namespacePrefix}_memory_save\` / \`_memory_recall\` / \`_memory_list\` / \`_memory_forget\` / \`_memory_compact\` / \`_memory_compaction_check\` / \`_memory_checkpoint_packet\`.`,
						'',
						'- Save durable facts an agent should remember next session: decisions, gotchas, where things live, conventions discovered.',
						'- `memory_save` upserts by title (no duplicates).',
						'- Recall only what you need (query/tags) — keep context small.',
						'  `memory_recall` also returns `sessionDigest`: the newest',
						'  `session-digest:*` note, so a resumed turn rehydrates the',
						'  distilled state instead of re-reading the dropped tail.',
						'- In-session compaction loop (spend far fewer tokens in the SAME chat):',
						'  1. `memory_compaction_check` — pass your carried tail size + turns',
						'     since the last compaction; it says WHEN to compact.',
						'  2. `memory_compact` — distils the working-state items you are',
						'     carrying into one digest, drops the noisy tail, and persists a',
						'     self-expiring `session-digest:<topic>` note.',
						'  3. `memory_recall` — surfaces that digest so you carry only the',
						'     distilled core forward.',
						'- `memory_checkpoint_packet` rehydrates the latest explicit digest as',
						'  a bounded, redacted packet (digest, pointers and next action) after',
						'  a host compaction or when resuming; it never reads host transcripts.',
						`- Notes persist in \`${joinRel(ctx.pluginCacheDir, 'notes.json')}\`.`,
						'- BM25 ranking parameters (k1, b, titleWeight) and the store',
						'  size limit (maxNotes) are configurable via `<config-file>`',
						'  under `plugins.memory.options` — defaults match the classic',
						'  Robertson/Zaragoza BM25.',
					].join('\n'),
				},
			],
		};
	},
});
