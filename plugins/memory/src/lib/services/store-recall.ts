/**
 * store-recall.ts — BM25-lite ranking on the note store.
 *
 * SRP — owns only the "find relevant notes" concern. It composes
 * `rankNotes` from `./rank.ts` (the per-corpus scorer) and the
 * read-only `readStore` from `./store-io.ts`. No file writes here:
 * recall is a read-only tool (effects: ['lazy']).
 *
 * DIP — the scoring parameters (bm25K1, bm25B, titleWeight) are
 * passed in from the plugin options, not read from a global. The
 * default-rank fallback (newest first) lives here so the file is
 * self-contained: callers don't need to know whether a query was
 * empty to get the right shape back.
 */
import { rankNotes } from './rank';
import { readStore } from './store-io';
import type { INote } from './store-types';

/**
 * Recall notes by free-text query and/or tags.
 * - `tags` is a hard filter (a note must carry all of them).
 * - With a `query`, results are ranked by lexical relevance (BM25-lite,
 *   see `rank.ts`), tie-broken by recency. Without one, newest first.
 */
export const recall = async (
	absPath: string,
	options: {
		query?: string;
		tags?: readonly string[];
		limit?: number;
		bm25K1?: number;
		bm25B?: number;
		titleWeight?: number;
	} = {},
): Promise<INote[]> => {
	const rawQuery = options.query?.trim() ?? '';
	const tags = options.tags ?? [];
	const limit = options.limit ?? 10;

	const filtered = (await readStore(absPath)).filter(
		(note) =>
			tags.length === 0 || tags.every((tag) => note.tags.includes(tag)),
	);

	if (rawQuery.length === 0) {
		return [...filtered]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, limit);
	}

	return rankNotes(filtered, rawQuery, {
		...(options.bm25K1 !== undefined ? { bm25K1: options.bm25K1 } : {}),
		...(options.bm25B !== undefined ? { bm25B: options.bm25B } : {}),
		...(options.titleWeight !== undefined
			? { titleWeight: options.titleWeight }
			: {}),
	})
		.filter((r) => r.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.note.updatedAt.localeCompare(a.note.updatedAt),
		)
		.slice(0, limit)
		.map((r) => r.note);
};
