import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson, toolOk } from '@mcp-vertex/core/public';

import {
	exportNotes,
	recordSessionDigestReuse,
	importNotes,
	readStore,
	recall,
	selectLatestSessionDigestForRecall,
	removeNote,
	saveNote,
} from '../services/store';
import { NoteQuotaExceededError } from '../services/store-records';
import { buildCompactToolRegistration } from './compact.tool';
import { buildCompactionCheckToolRegistration } from './compaction-check.tool';
import { buildCheckpointPacketToolRegistration } from './checkpoint-packet.tool';
import { guardCorruptStore } from './tool-guard-corrupt';

// MCP modern outputSchema shapes (N16). Error envelopes are exempt from
// SDK validation (isError:true), so these describe only the success path.
const NoteSchema = z.object({
	id: z.string(),
	title: z.string(),
	body: z.string(),
	tags: z.array(z.string()),
	createdAt: z.string(),
	updatedAt: z.string(),
	expiresAt: z.string().optional(),
});
const NoteIndexEntrySchema = z.object({
	id: z.string(),
	title: z.string(),
	tags: z.array(z.string()),
});
// f00090 S3: the newest `session-digest:*` note, surfaced on recall so a
// resumed turn rehydrates the distilled working state instead of re-reading
// the dropped raw tail. Omitted when no digest note exists.
const SessionDigestSchema = z.object({
	title: z.string(),
	topic: z.string(),
	body: z.string(),
	createdAt: z.string(),
});

/**
 * Run a memory operation, translating a corrupt-store error into a
 * structured tool error that names the preserved backup, so an agent
 * never silently reads (or overwrites) an empty store. Other errors
 * propagate to the SDK unchanged.
 */
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 8000;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;
const DEFAULT_RECALL_LIMIT = 10;
const MAX_RECALL_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_IMPORT_PAYLOAD_BYTES = 5_000_000;
const MIN_PAGE_LIMIT = 1;
const MIN_OFFSET = 0;

export interface IMemoryToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the note store JSON. */
	/**
	 * BM25 `k1` parameter (term-frequency saturation).
	 * Lower = single-occurrence heavy; higher = flatter curve. Default 1.5.
	 */
	readonly bm25K1: number;
	/**
	 * BM25 `b` parameter (document-length normalisation).
	 * 0 = length-blind; 1 = full normalisation. Default 0.75.
	 */
	readonly bm25B: number;
	/**
	 * Title-token weight multiplier in the BM25 corpus.
	 * Each title token counts `titleWeight` times. Default 2.
	 */
	readonly titleWeight: number;
	/**
	 * Max notes the store keeps on disk. Default 1000.
	 */
	readonly maxNotes: number;
	readonly storePathAbs: string;
}

/**
 * Persistent project memory tools. Notes live in one small JSON file
 * under the cache dir, so an agent keeps continuity across sessions
 * without re-reading the whole repo — recall only what it needs. This
 * store is for distilled reusable facts, not raw logs or per-turn
 * exploration that should die with the current slice.
 */
export const buildMemoryToolRegistrations = (
	options: IMemoryToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		buildCompactToolRegistration({
			namespacePrefix: prefix,
			storePathAbs: options.storePathAbs,
			maxNotes: options.maxNotes,
		}),
		buildCompactionCheckToolRegistration({ namespacePrefix: prefix }),
		buildCheckpointPacketToolRegistration({
			namespacePrefix: prefix,
			storePathAbs: options.storePathAbs,
		}),
		{
			id: 'save',
			effects: ['write'],
			summary: 'Save (or update) a titled note with optional tags.',
			descriptionKey: 'memory_save',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_save`,
					{
						description:
							'Save a small, durable note (upserts by title). Use for distilled decisions, gotchas, stable conventions and continuity worth keeping beyond the current slice or session. Do not use this as a log sink for raw tool output or per-turn exploration. Secrets (API keys, tokens, private keys) are auto-redacted; pass ttlSeconds for a self-expiring note.',
						inputSchema: z.object({
							title: z.string(),
							body: z.string(),
							tags: z.array(z.string()).optional(),
							ttlSeconds: z.number().int().positive().optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							saved: NoteSchema,
							redactedSecrets: z.number(),
						}),
					},
					async (args: {
						title: string;
						body: string;
						tags?: string[] | undefined;
						ttlSeconds?: number | undefined;
					}) => {
						if (args.title.length > MAX_TITLE_LENGTH) {
							return toolError(
								`title too long (max ${MAX_TITLE_LENGTH} chars)`,
								'Shorten the title; put detail in the body.',
							);
						}
						if (args.body.length > MAX_BODY_LENGTH) {
							return toolError(
								`body too long (max ${MAX_BODY_LENGTH} chars)`,
								'Summarise first; durable memory is for reusable notes, not logs or raw turn-by-turn traces.',
							);
						}
						if ((args.tags?.length ?? 0) > MAX_TAG_COUNT) {
							return toolError(
								`too many tags (max ${MAX_TAG_COUNT})`,
							);
						}
						if (
							args.tags?.some(
								(tag) => tag.length > MAX_TAG_LENGTH,
							)
						) {
							return toolError(
								`tag too long (max ${MAX_TAG_LENGTH} chars each)`,
								'Use short, keyword-like tags.',
							);
						}
						const MAX_TTL = 31_536_000; // 1 year
						if (
							args.ttlSeconds !== undefined &&
							args.ttlSeconds > MAX_TTL
						) {
							return toolError(
								`ttlSeconds too large (max ${MAX_TTL} = 1 year)`,
								'Omit ttlSeconds for a permanent note.',
							);
						}
						return guardCorruptStore(async () => {
							// Total-store quota: bound the note count so a runaway
							// agent can't grow the store unboundedly. Updates to an
							// existing note are always allowed.
							let saved: Awaited<ReturnType<typeof saveNote>>;
							try {
								saved = await saveNote(
									options.storePathAbs,
									{
										title: args.title,
										body: args.body,
										...(args.tags
											? { tags: args.tags }
											: {}),
										...(args.ttlSeconds !== undefined
											? { ttlSeconds: args.ttlSeconds }
											: {}),
									},
									undefined,
									options.maxNotes,
								);
							} catch (error) {
								if (error instanceof NoteQuotaExceededError) {
									return toolError(
										error.message,
										'Forget stale notes with memory_forget before adding new ones.',
									);
								}
								throw error;
							}
							return toolOk({
								saved: saved.note,
								redactedSecrets: saved.redactions,
							});
						});
					},
				);
			},
		},
		{
			id: 'recall',
			summary:
				'Recall notes by free-text query and/or tags (newest first).',
			tags: ['memory', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_recall`,
					{
						description:
							'Recall durable notes by query and/or tags. Use this before re-reading docs when the fact is likely to be a previously distilled reusable note. Low-token: returns only matches, newest first. Also returns `sessionDigest` — the newest `session-digest:*` note written by memory_compact — so a resumed turn rehydrates the distilled working state instead of re-reading the dropped tail.',
						inputSchema: z.object({
							query: z.string().optional(),
							tags: z.array(z.string()).optional(),
							limit: z.number().optional(),
						}),
						outputSchema: z.object({
							notes: z.array(NoteSchema),
							sessionDigest: SessionDigestSchema.optional(),
						}),
					},
					async (args: {
						query?: string | undefined;
						tags?: string[] | undefined;
						limit?: number | undefined;
					}) =>
						guardCorruptStore(async () => {
							// Read the complete store before starting the ranked read.
							// Both operations used to run in parallel; when corruption
							// was detected, Promise.all returned the first error while
							// the second quarantine could still be in flight and race a
							// caller that recreated the store path. The extra read is
							// cheap for this small durable store, and sequencing it makes
							// corruption handling deterministic.
							const all = await readStore(options.storePathAbs);
							const notes = await recall(options.storePathAbs, {
								...(args.query !== undefined
									? { query: args.query }
									: {}),
								...(args.tags ? { tags: args.tags } : {}),
								bm25K1: options.bm25K1,
								bm25B: options.bm25B,
								titleWeight: options.titleWeight,
								limit: Math.max(
									MIN_PAGE_LIMIT,
									Math.min(
										MAX_RECALL_LIMIT,
										Math.floor(
											args.limit ?? DEFAULT_RECALL_LIMIT,
										),
									),
								),
							});
							const sessionDigest =
								selectLatestSessionDigestForRecall(
									all.map((note) => ({
										title: note.title,
										body: note.body,
										createdAt: note.createdAt,
									})),
								);
							recordSessionDigestReuse(sessionDigest);
							return toolJson({
								notes,
								...(sessionDigest === null
									? {}
									: { sessionDigest }),
							});
						}),
				);
			},
		},
		{
			id: 'list',
			summary: 'List note ids, titles and tags (cheap index; paginated).',
			tags: ['memory', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_list`,
					{
						description: `List durable notes as a cheap index {id,title,tags}, newest first. Paginated: \`limit\` (default ${DEFAULT_LIST_LIMIT}, max ${MAX_LIST_LIMIT}) + \`offset\`. Returns {notes,total,offset,nextOffset}. Read a body with memory_recall only when the index suggests the note is relevant.`,
						inputSchema: z.object({
							limit: z.number().optional(),
							offset: z.number().optional(),
						}),
						outputSchema: z.object({
							notes: z.array(NoteIndexEntrySchema),
							total: z.number(),
							offset: z.number(),
							nextOffset: z.number().optional(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						offset?: number | undefined;
					}) =>
						guardCorruptStore(async () => {
							const all = (await readStore(options.storePathAbs))
								.slice()
								.sort((a, b) =>
									b.updatedAt.localeCompare(a.updatedAt),
								);
							const limit = Math.max(
								MIN_PAGE_LIMIT,
								Math.min(
									MAX_LIST_LIMIT,
									Math.floor(
										args.limit ?? DEFAULT_LIST_LIMIT,
									),
								),
							);
							const offset = Math.max(
								MIN_OFFSET,
								Math.floor(args.offset ?? 0),
							);
							const page = all.slice(offset, offset + limit);
							const nextOffset = offset + page.length;
							return toolJson({
								notes: page.map((note) => ({
									id: note.id,
									title: note.title,
									tags: note.tags,
								})),
								total: all.length,
								offset,
								...(nextOffset < all.length
									? { nextOffset }
									: {}),
							});
						}),
				);
			},
		},
		{
			id: 'forget',
			effects: ['write', 'destructive'],
			summary: 'Delete a note by id.',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_forget`,
					{
						description: 'Delete a note by id (from memory_list).',
						inputSchema: z.object({ id: z.string() }),
						outputSchema: z.object({
							ok: z.literal(true),
							removed: z.string(),
						}),
					},
					async (args: { id: string }) =>
						guardCorruptStore(async () => {
							const removed = await removeNote(
								options.storePathAbs,
								args.id,
							);
							return removed
								? toolOk({ removed: args.id })
								: toolError(
										`no note "${args.id}"`,
										'Call memory_list to see ids.',
									);
						}),
				);
			},
		},
		{
			id: 'export',
			summary: 'Export the full note store as a JSON or NDJSON snapshot.',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_export`,
					{
						description:
							'Export the full note store as a portable snapshot. `format: "json"` returns one { notes: [...] } document; `"ndjson"` returns one JSON object per line (streamable, diff-friendly). Expired notes are excluded unless `includeExpired: true`. Pair with memory_import to move notes between workspaces or take a backup.',
						inputSchema: z.object({
							format: z.enum(['json', 'ndjson']).optional(),
							includeExpired: z.boolean().optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							format: z.enum(['json', 'ndjson']),
							payload: z.string(),
							count: z.number(),
						}),
					},
					async (args: {
						format?: 'json' | 'ndjson' | undefined;
						includeExpired?: boolean | undefined;
					}) =>
						guardCorruptStore(async () => {
							const format = args.format ?? 'json';
							const { payload, count } = await exportNotes(
								options.storePathAbs,
								{
									format,
									...(args.includeExpired !== undefined
										? {
												includeExpired:
													args.includeExpired,
											}
										: {}),
								},
							);
							return toolOk({ format, payload, count });
						}),
				);
			},
		},
		{
			id: 'import',
			effects: ['write', 'destructive'],
			summary:
				'Import a previously exported snapshot (replace or merge).',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_import`,
					{
						description:
							'Import a snapshot produced by memory_export. `mode: "replace"` discards the current store first (destructive); `"merge"` (default) keeps existing notes and resolves id collisions per `conflict`: "overwrite" (incoming wins, default), "skip" (existing wins) or "merge" (union tags, longer body, newest timestamps win). Every incoming title/body/tag is redacted for secrets before it touches disk, exactly like memory_save.',
						inputSchema: z.object({
							payload: z.string(),
							format: z.enum(['json', 'ndjson']).optional(),
							mode: z.enum(['replace', 'merge']).optional(),
							conflict: z
								.enum(['overwrite', 'skip', 'merge'])
								.optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							imported: z.number(),
							skipped: z.number(),
							overwritten: z.number(),
							merged: z.number(),
							total: z.number(),
							redactedSecrets: z.number(),
						}),
					},
					async (args: {
						payload: string;
						format?: 'json' | 'ndjson' | undefined;
						mode?: 'replace' | 'merge' | undefined;
						conflict?: 'overwrite' | 'skip' | 'merge' | undefined;
					}) => {
						if (args.payload.length > MAX_IMPORT_PAYLOAD_BYTES) {
							return toolError(
								'payload too large (max 5MB)',
								'Split the import into smaller batches.',
							);
						}
						return guardCorruptStore(async () => {
							try {
								// a00083 F10: forward the configured maxNotes
								// so a single import can't blow past the
								// quota that saveNote enforces.
								const result = await importNotes(
									options.storePathAbs,
									args.payload,
									{
										format: args.format ?? 'json',
										mode: args.mode ?? 'merge',
										...(args.conflict !== undefined
											? { conflict: args.conflict }
											: {}),
										maxNotes: options.maxNotes,
									},
								);
								return toolOk({ ...result });
							} catch (err) {
								return toolError(
									`invalid import payload: ${err instanceof Error ? err.message : String(err)}`,
									'Pass the exact payload returned by memory_export with a matching format.',
								);
							}
						});
					},
				);
			},
		},
	];
};
