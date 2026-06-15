import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import {
	CorruptFileError,
	toolError,
	toolJson,
	toolOk,
} from '@cartago-git/mcp-core/public';
import type { IToolTextResult } from '@cartago-git/mcp-core/public';

import { readStore, recall, removeNote, saveNote } from './store';

/**
 * Run a memory operation, translating a corrupt-store error into a
 * structured tool error that names the preserved backup, so an agent
 * never silently reads (or overwrites) an empty store. Other errors
 * propagate to the SDK unchanged.
 */
const guardCorrupt = (fn: () => IToolTextResult): IToolTextResult => {
	try {
		return fn();
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
						return guardCorrupt(() =>
							toolOk({
								saved: saveNote(options.storePathAbs, {
									title: args.title,
									body: args.body,
									...(args.tags ? { tags: args.tags } : {}),
								}),
							})
						);
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
			summary: 'List all note ids, titles and tags (cheap index).',
			tags: ['memory', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_memory_list`,
					{
						description:
							'List every note as {id,title,tags}. Read a body with memory_recall.',
					},
					async () =>
						guardCorrupt(() =>
							toolJson({
								notes: readStore(options.storePathAbs).map(
									(note) => ({
										id: note.id,
										title: note.title,
										tags: note.tags,
									})
								),
							})
						)
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
						guardCorrupt(() => {
							const removed = removeNote(
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
