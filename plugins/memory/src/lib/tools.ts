import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	CorruptFileError,
	toolError,
	toolJson,
	toolOk,
} from '@mcp-vertex/core/public';
import type { IToolTextResult } from '@mcp-vertex/core/public';

import {
	exportNotes,
	getMaxNotes,
	deriveNoteId,
	importNotes,
	readStore,
	recall,
	removeNote,
	saveNote,
} from './store';

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

/**
 * Run a memory operation, translating a corrupt-store error into a
 * structured tool error that names the preserved backup, so an agent
 * never silently reads (or overwrites) an empty store. Other errors
 * propagate to the SDK unchanged.
 */
const guardCorrupt = async (
	fn: () => IToolTextResult | Promise<IToolTextResult>,
): Promise<IToolTextResult> => {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CorruptFileError) {
			return toolError(
				`memory store is corrupt: ${err.message}`,
				err.backupPath
					? `The corrupt file was preserved at "${err.backupPath}". Inspect or delete it, then retry.`
					: 'Could not back up the corrupt store; inspect it manually before retrying.',
			);
		}
		throw err;
	}
};

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
 * without re-reading the whole repo — recall only what it needs.
 */
export const buildMemoryToolRegistrations = (
	options: IMemoryToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
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
							'Save a small, durable note (upserts by title). Use for decisions, gotchas and continuity an agent should remember next session. Secrets (API keys, tokens, private keys) are auto-redacted; pass ttlSeconds for a self-expiring note.',
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
						if (args.title.length > 200) {
							return toolError(
								'title too long (max 200 chars)',
								'Shorten the title; put detail in the body.',
							);
						}
						if (args.body.length > 8000) {
							return toolError(
								'body too long (max 8000 chars)',
								'Summarise; memory is for durable notes, not logs.',
							);
						}
						if ((args.tags?.length ?? 0) > 20) {
							return toolError('too many tags (max 20)');
						}
						if (args.tags?.some((tag) => tag.length > 50)) {
							return toolError(
								'tag too long (max 50 chars each)',
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
						return guardCorrupt(async () => {
							// Total-store quota: bound the note count so a runaway
							// agent can't grow the store unboundedly. Updates to an
							// existing note are always allowed.
							const id = deriveNoteId(args.title);
							const notes = await readStore(options.storePathAbs);
							const isNew = !notes.some((note) => note.id === id);
							if (
								isNew &&
								notes.length >= getMaxNotes(options.maxNotes)
							) {
								return toolError(
									`note store is full (max ${getMaxNotes(options.maxNotes)} notes)`,
									'Forget stale notes with memory_forget before adding new ones.',
								);
							}
							const { note, redactions } = await saveNote(
								options.storePathAbs,
								{
									title: args.title,
									body: args.body,
									...(args.tags ? { tags: args.tags } : {}),
									...(args.ttlSeconds !== undefined
										? { ttlSeconds: args.ttlSeconds }
										: {}),
								},
							);
							return toolOk({
								saved: note,
								redactedSecrets: redactions,
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
							'Recall durable notes by query and/or tags. Low-token: returns only matches, newest first.',
						inputSchema: z.object({
							query: z.string().optional(),
							tags: z.array(z.string()).optional(),
							limit: z.number().optional(),
						}),
						outputSchema: z.object({ notes: z.array(NoteSchema) }),
					},
					async (args: {
						query?: string | undefined;
						tags?: string[] | undefined;
						limit?: number | undefined;
					}) =>
						guardCorrupt(async () =>
							toolJson({
								notes: await recall(options.storePathAbs, {
									...(args.query !== undefined
										? { query: args.query }
										: {}),
									...(args.tags ? { tags: args.tags } : {}),
									bm25K1: options.bm25K1,
									bm25B: options.bm25B,
									titleWeight: options.titleWeight,
									limit: Math.max(
										1,
										Math.min(
											50,
											Math.floor(args.limit ?? 10),
										),
									),
								}),
							}),
						),
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
						description:
							'List notes as {id,title,tags}, newest first. Paginated: `limit` (default 50, max 200) + `offset`. Returns {notes,total,offset,nextOffset}. Read a body with memory_recall.',
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
						guardCorrupt(async () => {
							const all = (await readStore(options.storePathAbs))
								.slice()
								.sort((a, b) =>
									b.updatedAt.localeCompare(a.updatedAt),
								);
							const limit = Math.max(
								1,
								Math.min(200, Math.floor(args.limit ?? 50)),
							);
							const offset = Math.max(
								0,
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
						guardCorrupt(async () => {
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
						guardCorrupt(async () => {
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
						if (args.payload.length > 5_000_000) {
							return toolError(
								'payload too large (max 5MB)',
								'Split the import into smaller batches.',
							);
						}
						return guardCorrupt(async () => {
							try {
								const result = await importNotes(
									options.storePathAbs,
									args.payload,
									{
										format: args.format ?? 'json',
										mode: args.mode ?? 'merge',
										...(args.conflict !== undefined
											? { conflict: args.conflict }
											: {}),
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
