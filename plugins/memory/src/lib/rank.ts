import type { INote } from './store';

/**
 * Lexical relevance ranking for `memory_recall` — a dependency-free,
 * offline BM25-lite scorer over the JSON note store. [N22]
 *
 * NOT vector/embedding "semantic" search: that needs an external model
 * (network or a heavy local dep), which would break the agnostic, offline
 * contract of the core. This ranks by term relevance (BM25 with the title
 * weighted over the body) and keeps a substring floor so partial-token
 * matches (e.g. `mysql` inside `mysql2`) still surface.
 */

export interface IRankedNote {
	readonly note: INote;
	readonly score: number;
}

const DEFAULT_TITLE_WEIGHT = 2;
const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;
const SUBSTRING_BONUS = 0.1;

export const tokenize = (text: string): string[] =>
	text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Resolve BM25 tuning parameters for one ranking call. Honours per-call
 * overrides from `tools.ts` (which receives them from the plugin
 * `optionsSchema`); falls back to the canonical defaults. Exposed as a
 * pure helper so {@link rankNotes} stays dependency-free and the same
 * defaults are re-used in tests.
 */
export const getBm25Params = (overrides?: {
	bm25K1?: number | undefined;
	bm25B?: number | undefined;
	titleWeight?: number | undefined;
}): {
	readonly k1: number;
	readonly b: number;
	readonly titleWeight: number;
} => ({
	k1: overrides?.bm25K1 ?? DEFAULT_K1,
	b: overrides?.bm25B ?? DEFAULT_B,
	titleWeight: overrides?.titleWeight ?? DEFAULT_TITLE_WEIGHT,
});

/**
 * Score each note against the query (BM25 over title×titleWeight + body,
 * plus a substring bonus). Pure; corpus stats (df, avg length) are
 * computed over the passed-in notes so ranking is self-contained per call.
 */
export const rankNotes = (
	notes: readonly INote[],
	query: string,
	overrides?: Parameters<typeof getBm25Params>[0],
): IRankedNote[] => {
	const { k1, b, titleWeight } = getBm25Params(overrides);
	const queryTerms = [...new Set(tokenize(query))];
	const rawQuery = query.toLowerCase().trim();

	const docs = notes.map((note) => {
		const titleTokens = tokenize(note.title);
		const tokens = [
			...Array.from({ length: titleWeight }, () => titleTokens).flat(),
			...tokenize(note.body),
		];
		const freq = new Map<string, number>();
		for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
		return { note, freq, len: tokens.length };
	});

	const n = docs.length;
	const avgLen = n === 0 ? 0 : docs.reduce((s, d) => s + d.len, 0) / n;
	const df = new Map<string, number>();
	for (const term of queryTerms) {
		df.set(term, docs.filter((d) => (d.freq.get(term) ?? 0) > 0).length);
	}

	return docs.map((d) => {
		let score = 0;
		for (const term of queryTerms) {
			const tf = d.freq.get(term) ?? 0;
			if (tf === 0) continue;
			const dfi = df.get(term) ?? 0;
			const idf = Math.log(1 + (n - dfi + 0.5) / (dfi + 0.5));
			const denom = tf + k1 * (1 - b + (b * d.len) / (avgLen || 1));
			score += idf * ((tf * (k1 + 1)) / denom);
		}
		// Substring floor: covers partial-token matches the tokenizer splits.
		if (
			rawQuery.length > 0 &&
			(d.note.title.toLowerCase().includes(rawQuery) ||
				d.note.body.toLowerCase().includes(rawQuery))
		) {
			score += SUBSTRING_BONUS;
		}
		return { note: d.note, score };
	});
};
