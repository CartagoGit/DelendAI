import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import {
	CorruptFileError,
	toolError,
	toolJson,
	toolOk,
} from '@cartago-git/mcp-core/public';
import type { IToolTextResult } from '@cartago-git/mcp-core/public';

import {
	MAX_NOTES,
	deriveNoteId,
	readStore,
	recall,
	removeNote,
	saveNote,
} from './store';

/**
 * Run a memory operation, translating a corrupt-store error into a
 * structured tool error that names the preserved backup, so an agent
 * never silently reads (or overwrites) an empty store. Other errors
 * propagate to the SDK unchanged.
 */
const guardCorrupt = async (
	fn: () => IToolTextResult | Promise<IToolTextResult>
): Promise<IToolTextResult> => {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CorruptFileError) {
			return toolError(
				`memory store is corrupt: ${err.message}`,
				err.backupPath
					? `The corrupt file was preserved at "${err.backupPath}". Inspect or delete it, then retry.`
					: 'Could not back up the corrupt store; inspect it manually before retrying.'
			);
		}
		throw err;
	}
};

export interface IMemoryToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the note store JSON. */
	readonly storePathAbs: string;
}

/**
 * Persistent project memory tools. Notes live in one small JSON file
 * under the cache dir, so an agent keeps continuity across sessions
 * without re-reading the whole repo — recall only what it needs.
 */
export const buildMemoryToolRegistrations = (
	options: IMemoryToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'memory_save',
			summary: 'Save (or update) a titled note with optional tags.',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_memory_save`,
					{
						description:
							'Save a small, durable note (upserts by title). Use for decisions, gotchas and continuity an agent should remember next session.',
						inputSchema: z.object({
							title: z.string(),
							body: z.string(),
							tags: z.array(z.string()).optional(),
						}),
						},
					async (args: {
						title: string;
						body: string;
						tags?: string[] | undefined;
					}) => {
						if (args.title.length > 200) {
							return toolError(
								'title too long (max 200 chars)',
								'Shorten the title; put detail in the body.'
							);
						}
						if (args.body.length > 8000) {
							return toolError(
								'body too long (max 8000 chars)',
								'Summarise; memory is for durable notes, not logs.'
							);
						}
						if ((args.tags?.length ?? 0) > 20) {
							return toolError('too many tags (max 20)');
						}
						if (args.tags?.some((tag) => tag.length > 50)) {
							return toolError(
								'tag too long (max 50 chars each)',
								'Use short, keyword-like tags.'
							);
						}
						return guardCorrupt(async () => {
							// Total-store quota: bound the note count so a runaway
							// agent can't grow the store unboundedly. Updates to an
							// existing note are always allowed.
							const id = deriveNoteId(args.title);
							const notes = readStore(options.storePathAbs);
							const isNew = !notes.some((note) => note.id === id);
							if (isNew && notes.length >= MAX_NOTES) {
								return toolError(
									`note store is full (max ${MAX_NOTES} notes)`,
									'Forget stale notes with memory_forget before adding new ones.'
								);
							}
							return toolOk({
								saved: await saveNote(options.storePathAbs, {
									title: args.title,
									body: args.body,
									...(args.tags ? { tags: args.tags } : {}),
								}),
							});
						});
					}
				);
			},
		},
		{
			id: 'memory_recall',
			summary: 'Recall notes by free-text query and/or tags (newest first).',
			tags: ['memory', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_memory_recall`,
					{
						description:
							'Recall durable notes by query and/or tags. Low-token: returns only matches, newest first.',
						inputSchema: z.object({
							query: z.string().optional(),
							tags: z.array(z.string()).optional(),
							limit: z.number().optional(),
						}),
					},
					async (args: {
						query?: string | undefined;
						tags?: string[] | undefined;
						limit?: number | undefined;
					}) =>
						guardCorrupt(() =>
							toolJson({
								notes: recall(options.storePathAbs, {
									...(args.query !== undefined
										? { query: args.query }
										: {}),
									...(args.tags ? { tags: args.tags } : {}),
									limit: Math.max(
										1,
										Math.min(50, Math.floor(args.limit ?? 10))
									),
								}),
							})
						)
				);
			},
		},
		{
			id: 'memory_list',
			summary: 'List note ids, titles and tags (cheap index; paginated).',
			tags: ['memory', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_memory_list`,
					{
						description:
							'List notes as {id,title,tags}, newest first. Paginated: `limit` (default 50, max 200) + `offset`. Returns {notes,total,offset,nextOffset}. Read a body with memory_recall.',
						inputSchema: z.object({
							limit: z.number().optional(),
							offset: z.number().optional(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						offset?: number | undefined;
					}) =>
						guardCorrupt(() => {
							const all = readStore(options.storePathAbs)
								.slice()
								.sort((a, b) =>
									b.updatedAt.localeCompare(a.updatedAt)
								);
							const limit = Math.max(
								1,
								Math.min(200, Math.floor(args.limit ?? 50))
							);
							const offset = Math.max(0, Math.floor(args.offset ?? 0));
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
						})
				);
			},
		},
		{
			id: 'memory_forget',
			summary: 'Delete a note by id.',
			tags: ['memory'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_memory_forget`,
					{
						description: 'Delete a note by id (from memory_list).',
						inputSchema: z.object({ id: z.string() }),
					},
					async (args: { id: string }) =>
						guardCorrupt(async () => {
							const removed = await removeNote(
								options.storePathAbs,
								args.id
							);
							return removed
								? toolOk({ removed: args.id })
								: toolError(
										`no note "${args.id}"`,
										'Call memory_list to see ids.'
									);
						})
				);
			},
		},
	];
};
