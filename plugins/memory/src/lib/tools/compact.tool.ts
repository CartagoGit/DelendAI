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
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';
import type { IToolTextResult } from '@delendai/core/public';

import {
	distillContextDigest,
	type IContextItem,
	type IContextItemKind,
} from '../services/compaction';
import { verifySummaryPreserves } from '../compaction/preserve-rules.helper';
import { SESSION_DIGEST_TITLE_PREFIX } from '../contracts/constants/session-digest.constant';
import { saveNote } from '../services/store';
import { NoteQuotaExceededError } from '../services/store-records';
import { guardCorruptStore } from './tool-guard-corrupt';

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

const _TokenAccountingSchema = z.object({
	inputEstimate: z.number(),
	digestEstimate: z.number(),
	savedEstimate: z.number(),
	keptCount: z.number(),
	discardedCount: z.number(),
});

const DEFAULT_SESSION_TTL_SECONDS = 3600; // 1h — survives the session, then dies.
const MAX_TOPIC_LENGTH = 120;
const MIN_DETAIL_MAX_CHARS = 20;
const MAX_DETAIL_MAX_CHARS = 2000;
const MAX_ITEMS = 200;

export interface ICompactToolOptions {
	readonly namespacePrefix: string;
	readonly storePathAbs: string;
	/** Total-store quota; reused so a runaway compaction can't overflow it. */
	readonly maxNotes: number;
}

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
			'Distil carried working-state into a compact session digest; drop the noisy tail.',
		tags: ['memory', 'token-efficiency'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_compact`,
				{
					description:
						'In-session context compaction. Hand over the working-state items you are currently carrying (decisions, open tasks, facts, pointers, plus the raw output/exploration/superseded noise) and get back ONE compact digest that keeps only the load-bearing core, so you can drop the raw conversation tail and spend far fewer tokens in the SAME chat. `decision|open|fact|pointer` are kept by default; `output|exploration|superseded` are discarded by default; override per item with `pin`/`drop`. By default the digest is persisted as a self-expiring `session-digest:<topic>` note (recall it later instead of re-reading); set `persist:false` for a dry-run preview. Returns the digest body + token accounting (estimated tokens in vs. kept vs. saved). Secrets are auto-redacted before the digest is stored.',
					inputSchema: z.object({
						topic: z.string().min(1).max(MAX_TOPIC_LENGTH),
						items: z.array(ContextItemSchema).max(MAX_ITEMS),
						detailMaxChars: z
							.number()
							.int()
							.min(MIN_DETAIL_MAX_CHARS)
							.max(MAX_DETAIL_MAX_CHARS)
							.optional(),
						persist: z.boolean().optional(),
						ttlSeconds: z.number().int().positive().optional(),
					}),
					outputSchema: z.object({
						digest: z.string(),
						sections: z.unknown(),
						tokenAccounting: z.unknown(),
						persisted: z.boolean(),
						noteId: z.string().optional(),
						redactedSecrets: z.number(),
						/**
						 * q00014 S6: what the digest DROPPED that the raw
						 * items said was load-bearing. A compaction that
						 * loses a user constraint or a commit SHA does not
						 * look like a failure — it looks like a shorter
						 * context — so the caller is told before it throws
						 * the original away.
						 */
						preservation: z.object({
							ok: z.boolean(),
							droppedCount: z.number(),
							dropped: z.array(
								z.object({
									category: z.string(),
									text: z.string(),
								}),
							),
							nextAction: z.string(),
						}),
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
							...(item.pin !== undefined
								? { pin: item.pin }
								: {}),
							...(item.drop !== undefined
								? { drop: item.drop }
								: {}),
						}),
					);
					const result = distillContextDigest(
						items,
						args.detailMaxChars !== undefined
							? { detailMaxChars: args.detailMaxChars }
							: {},
					);

					// Check the digest against the raw items BEFORE the
					// caller acts on it. The distiller decides what to keep
					// by an item's `kind`; this asks the different question
					// of whether anything load-bearing fell out of the text
					// regardless of kind — a constraint the user set, a
					// cause someone established, a SHA. Advisory, never a
					// refusal: the caller may have good reason to compact
					// anyway, and a compaction tool that refuses to compact
					// is its own kind of dead end.
					const preservationVerdict = verifySummaryPreserves({
						source: items
							.map((item) =>
								[item.label, item.detail]
									.filter(
										(part): part is string =>
											part !== undefined,
									)
									.join(' — '),
							)
							.join('\n'),
						summary: result.digest,
					});
					const preservation = {
						ok: preservationVerdict.ok,
						droppedCount: preservationVerdict.dropped.length,
						dropped: preservationVerdict.dropped
							.slice(0, 10)
							.map((fragment) => ({
								category: fragment.category,
								text: fragment.text,
							})),
						nextAction: preservationVerdict.nextAction,
					};

					const persist = args.persist ?? true;
					if (!persist) {
						return toolJson({
							digest: result.digest,
							sections: result.sections,
							tokenAccounting: result.tokenAccounting,
							persisted: false,
							redactedSecrets: 0,
							preservation,
						});
					}

					return guardCorruptStore(async () => {
						const title = `${SESSION_DIGEST_TITLE_PREFIX}${args.topic}`;
						// Reuse the durable-store quota; a session digest is one
						// upserted note per topic, so this only trips when the
						// store is already full of OTHER notes.
						let saved: Awaited<ReturnType<typeof saveNote>>;
						try {
							saved = await saveNote(
								options.storePathAbs,
								{
									title,
									body: result.digest,
									tags: ['session-digest'],
									ttlSeconds:
										args.ttlSeconds ??
										DEFAULT_SESSION_TTL_SECONDS,
								},
								undefined,
								options.maxNotes,
							);
						} catch (error) {
							if (error instanceof NoteQuotaExceededError) {
								return toolError(
									error.message,
									'Forget stale notes with memory_forget before compacting.',
								);
							}
							throw error;
						}
						return toolJson({
							digest: saved.note.body,
							sections: result.sections,
							tokenAccounting: result.tokenAccounting,
							persisted: true,
							noteId: saved.note.id,
							redactedSecrets: saved.redactions,
							preservation,
						});
					});
				},
			);
		},
	};
};
