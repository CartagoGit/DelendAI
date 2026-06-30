/**
 * compact.tool.ts — the `memory_compact` tool (f00090 S1).
 *
 * Within-session context compaction: the agent hands over the working-state
 * items it is currently dragging along the conversation tail; the tool distils
 * them (deterministically) into one compact digest, persists the digest as a
 * self-expiring note in the existing memory store (so it survives the rest of
 * the session and is recallable, then dies), and returns the digest body plus
 * a token-accounting summary. The agent then drops the raw tail and carries
 * only the digest forward — spending far fewer tokens in the SAME chat.
 *
 * The tool is a thin adapter over the pure `distillContextDigest` distiller and
 * the existing `saveNote` (which inherits secret redaction + atomic+mutex
 * write + TTL expiry from the durable-memory contract). No new persistence
 * path is introduced (DIP — persistence is the store's job, not the tool's).
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { CorruptFileError, toolError, toolJson } from '@mcp-vertex/core/public';
import type { IToolTextResult } from '@mcp-vertex/core/public';

import {
	distillContextDigest,
	type IContextItem,
	type IContextItemKind,
} from '../services/compaction';
import { getMaxNotes, readStore, saveNote } from '../services/store';

const CONTEXT_ITEM_KINDS = [
	'decision',
	'open',
	'fact',
	'pointer',
	'output',
	'exploration',
	'superseded',
] as const satisfies readonly IContextItemKind[];

const ContextItemSchema = z.object({
	kind: z.enum(CONTEXT_ITEM_KINDS),
	label: z.string().min(1),
	detail: z.string().optional(),
	tokensEstimate: z.number().int().nonnegative().optional(),
	pin: z.boolean().optional(),
	drop: z.boolean().optional(),
});

const TokenAccountingSchema = z.object({
	inputEstimate: z.number(),
	digestEstimate: z.number(),
	savedEstimate: z.number(),
	keptCount: z.number(),
	discardedCount: z.number(),
});

const DEFAULT_SESSION_TTL_SECONDS = 3600; // 1h — survives the session, then dies.
const MAX_ITEMS = 200;

export interface ICompactToolOptions {
	readonly namespacePrefix: string;
	readonly storePathAbs: string;
	/** Total-store quota; reused so a runaway compaction can't overflow it. */
	readonly maxNotes: number;
}

const guardCorrupt = async (
	fn: () => Promise<IToolTextResult>,
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

/**
 * Build the `memory_compact` registration. Persistence is OPTIONAL: when
 * `persist` is false the tool only returns the digest (a dry-run preview); when
 * true (default) it saves the digest as a `session-digest:<topic>` TTL note.
 */
export const buildCompactToolRegistration = (
	options: ICompactToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'compact',
		effects: ['write'],
		summary:
			'Distil the carried working-state items into a compact session digest and drop the noisy tail (token-efficient).',
		tags: ['memory', 'token-efficiency'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_compact`,
				{
					description:
						'In-session context compaction. Hand over the working-state items you are currently carrying (decisions, open tasks, facts, pointers, plus the raw output/exploration/superseded noise) and get back ONE compact digest that keeps only the load-bearing core, so you can drop the raw conversation tail and spend far fewer tokens in the SAME chat. `decision|open|fact|pointer` are kept by default; `output|exploration|superseded` are discarded by default; override per item with `pin`/`drop`. By default the digest is persisted as a self-expiring `session-digest:<topic>` note (recall it later instead of re-reading); set `persist:false` for a dry-run preview. Returns the digest body + token accounting (estimated tokens in vs. kept vs. saved). Secrets are auto-redacted before the digest is stored.',
					inputSchema: z.object({
						topic: z.string().min(1).max(120),
						items: z.array(ContextItemSchema).max(MAX_ITEMS),
						detailMaxChars: z.number().int().min(20).max(2000).optional(),
						persist: z.boolean().optional(),
						ttlSeconds: z.number().int().positive().optional(),
					}),
					outputSchema: z.object({
						digest: z.string(),
						sections: z.array(
							z.object({
								kind: z.enum(CONTEXT_ITEM_KINDS),
								heading: z.string(),
								bullets: z.array(z.string()),
							}),
						),
						tokenAccounting: TokenAccountingSchema,
						persisted: z.boolean(),
						noteId: z.string().optional(),
						redactedSecrets: z.number(),
					}),
				},
				async (args: {
					topic: string;
					items: Array<{
						kind: IContextItemKind;
						label: string;
						detail?: string | undefined;
						tokensEstimate?: number | undefined;
						pin?: boolean | undefined;
						drop?: boolean | undefined;
					}>;
					detailMaxChars?: number | undefined;
					persist?: boolean | undefined;
					ttlSeconds?: number | undefined;
				}): Promise<IToolTextResult> => {
					const items: readonly IContextItem[] = args.items.map(
						(item) => ({
							kind: item.kind,
							label: item.label,
							...(item.detail !== undefined
								? { detail: item.detail }
								: {}),
							...(item.tokensEstimate !== undefined
								? { tokensEstimate: item.tokensEstimate }
								: {}),
							...(item.pin !== undefined ? { pin: item.pin } : {}),
							...(item.drop !== undefined ? { drop: item.drop } : {}),
						}),
					);
					const result = distillContextDigest(
						items,
						args.detailMaxChars !== undefined
							? { detailMaxChars: args.detailMaxChars }
							: {},
					);

					const persist = args.persist ?? true;
					if (!persist) {
						return toolJson({
							digest: result.digest,
							sections: result.sections,
							tokenAccounting: result.tokenAccounting,
							persisted: false,
							redactedSecrets: 0,
						});
					}

					return guardCorrupt(async () => {
						const title = `session-digest:${args.topic}`;
						// Reuse the durable-store quota; a session digest is one
						// upserted note per topic, so this only trips when the
						// store is already full of OTHER notes.
						const limit = getMaxNotes(options.maxNotes);
						const existing = await readStore(options.storePathAbs);
						const id = title
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, '-')
							.replace(/^-+|-+$/g, '');
						const isNew = !existing.some((note) => note.id === id);
						if (isNew && existing.length >= limit) {
							return toolError(
								`note store is full (max ${limit} notes)`,
								'Forget stale notes with memory_forget before compacting.',
							);
						}
						const { note, redactions } = await saveNote(
							options.storePathAbs,
							{
								title,
								body: result.digest,
								tags: ['session-digest'],
								ttlSeconds:
									args.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS,
							},
						);
						return toolJson({
							digest: note.body,
							sections: result.sections,
							tokenAccounting: result.tokenAccounting,
							persisted: true,
							noteId: note.id,
							redactedSecrets: redactions,
						});
					});
				},
			);
		},
	};
};
