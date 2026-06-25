/**
 * `negotiate-locale` — pure helper for picking the visitor's preferred
 * locale from a list of inputs in priority order:
 *
 *   1. Explicit override (`?lang=es` query string).
 *   2. Persisted cookie (`mcp_vertex_locale=es`).
 *   3. Browser `navigator.languages` / `Accept-Language` header.
 *
 * The function is DOM-free: it takes raw strings and returns the
 * resolved `Lang` (one of the 12 canonical codes) or `null` when no
 * preference can be matched. The caller decides what to do with `null`
 * — for a static-site root, that means "render the English default".
 *
 * RFC 4647 §3.4 filtering is approximated: each candidate is matched
 * by *prefix* (e.g. `en-US` → `en`) against the supported set, with
 * ties broken by the quality value `q=` (default 1.0) declared in the
 * header. The browser-supplied `navigator.languages` array is
 * already ordered, so we honour that ordering too.
 *
 * This module lives under `scripts/lib/` so the existing
 * `apps/web/scripts/__tests__/` convention picks it up without
 * needing a new Vitest entry — the helper is consumed by an inline
 * `<script>` in `src/pages/index.astro` (browser) and by the spec
 * file (Node) under the same import path.
 */

import {
	languages,
	languageCodes,
	type Lang,
} from '../../../shared/src/i18n/shared';

export type NegotiateInput = {
	/** Explicit override from the URL (e.g. `?lang=es`). May be invalid. */
	readonly queryLang: string | null;
	/** Persisted choice from a previous visit (`mcp_vertex_locale`). */
	readonly cookieLang: string | null;
	/**
	 * Either the raw `Accept-Language` HTTP header value, or a JSON-ish
	 * array of `navigator.languages` joined with `,`. Both formats use
	 * `q=` weights; the helper handles both transparently.
	 */
	readonly acceptLanguage: string | null;
};

export type NegotiateResult = {
	/** Resolved locale, or `null` when nothing matched. */
	readonly lang: Lang | null;
	/** Which input layer produced the match (debug aid + tests). */
	readonly source: 'query' | 'cookie' | 'header' | null;
};

/** Cookie name shared between server-set and client-set code paths. */
export const LOCALE_COOKIE = 'mcp_vertex_locale';

/** Type guard — true when `code` is one of the 12 supported Lang codes. */
const isSupported = (code: string): code is Lang =>
	(languageCodes as readonly string[]).includes(code);

/**
 * Parse a single Accept-Language entry like `en-US;q=0.9` into
 * `{ code: 'en-US', q: 0.9 }`. Per RFC 7231, the default `q` is 1.0
 * and `q` is clamped to `[0, 1]`.
 */
type AcceptEntry = { readonly code: string; readonly q: number };
const parseAcceptEntry = (raw: string): AcceptEntry | null => {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const parts = trimmed.split(';').map((p) => p.trim());
	const code = parts[0];
	if (!code) return null;
	let q = 1;
	for (const param of parts.slice(1)) {
		const m = /^q=(-?[0-9.]+)$/.exec(param);
		if (!m || !m[1]) continue;
		const parsed = Number.parseFloat(m[1]);
		if (Number.isFinite(parsed)) q = Math.max(0, Math.min(1, parsed));
	}
	return { code, q };
};

/**
 * Given an ordered list of Accept-Language candidates (with quality),
 * return the highest-scoring supported prefix match, or `null` when
 * none of the candidates map to a known `Lang`. Ties are broken by
 * the order of `candidates` (i.e. earlier wins).
 */
export const pickFromHeader = (
	candidates: readonly AcceptEntry[],
): Lang | null => {
	let best: { lang: Lang; q: number; order: number } | null = null;
	for (const [order, entry] of candidates.entries()) {
		if (entry.q <= 0) continue;
		// Match by prefix: `en-US` → try `en-US` then `en`.
		const lower = entry.code.toLowerCase();
		const segments = lower.split('-');
		for (let i = segments.length; i > 0; i--) {
			const candidate = segments.slice(0, i).join('-');
			if (!isSupported(candidate)) continue;
			const lang = candidate as Lang;
			if (best === null) {
				best = { lang, q: entry.q, order };
				break;
			}
			// Prefer higher q; ties broken by earlier order in the input.
			if (
				entry.q > best.q ||
				(entry.q === best.q && order < best.order)
			) {
				best = { lang, q: entry.q, order };
			}
			break;
		}
	}
	return best?.lang ?? null;
};

/**
 * Parse a raw `Accept-Language` header value (or `navigator.languages`
 * joined with `,`) into ordered entries. Returns an empty array for
 * nullish / empty / whitespace-only input.
 */
export const parseAcceptLanguage = (raw: string | null): AcceptEntry[] => {
	if (raw === null) return [];
	const entries: AcceptEntry[] = [];
	for (const piece of raw.split(',')) {
		const parsed = parseAcceptEntry(piece);
		if (parsed !== null) entries.push(parsed);
	}
	return entries;
};

/**
 * Top-level entry point. Resolves the preferred `Lang` from the
 * provided inputs in priority order. Returns `null` when no input
 * matches a supported locale — the caller should treat that as
 * "stay on the default" rather than throwing.
 */
export const negotiateLocale = (input: NegotiateInput): NegotiateResult => {
	const { queryLang, cookieLang, acceptLanguage } = input;

	if (queryLang !== null && isSupported(queryLang)) {
		return { lang: queryLang as Lang, source: 'query' };
	}
	if (cookieLang !== null && isSupported(cookieLang)) {
		return { lang: cookieLang as Lang, source: 'cookie' };
	}

	const headerLang = pickFromHeader(parseAcceptLanguage(acceptLanguage));
	if (headerLang !== null) {
		return { lang: headerLang, source: 'header' };
	}
	return { lang: null, source: null };
};

/**
 * Set the locale cookie from the browser. Exported so the inline
 * `<script>` in the root page and any future locale-switcher component
 * share the exact same persistence semantics (path, max-age, SameSite).
 * Kept tiny and side-effect free beyond the single cookie write.
 */
export const localeCookieAttrs = (): string =>
	`path=/; max-age=31536000; SameSite=Lax`;

// Re-export for callers that want to render a switcher or label map.
export { languages, languageCodes };
export type { Lang };
