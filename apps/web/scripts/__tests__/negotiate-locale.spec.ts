/**
 * Specs for `negotiate-locale.ts`. Pure-function tests — no DOM, no
 * network. The helper is consumed by the root `index.astro` via an
 * inline `<script>`, but the negotiation logic itself must be unit
 * tested in Node so we never ship a redirector with a regression in
 * the quality-value tie-breaking or prefix matching.
 */
import { describe, expect, it } from 'vitest';

import {
	LOCALE_COOKIE,
	localeCookieAttrs,
	negotiateLocale,
	parseAcceptLanguage,
	pickFromHeader,
} from '../lib/negotiate-locale';

describe('parseAcceptLanguage', () => {
	it('returns empty for null', () => {
		expect(parseAcceptLanguage(null)).toEqual([]);
	});

	it('returns empty for empty string', () => {
		expect(parseAcceptLanguage('')).toEqual([]);
	});

	it('parses a single entry with implicit q=1', () => {
		expect(parseAcceptLanguage('en')).toEqual([{ code: 'en', q: 1 }]);
	});

	it('parses multiple entries with explicit weights', () => {
		expect(parseAcceptLanguage('en-US,en;q=0.9,es;q=0.8')).toEqual([
			{ code: 'en-US', q: 1 },
			{ code: 'en', q: 0.9 },
			{ code: 'es', q: 0.8 },
		]);
	});

	it('ignores malformed q values without throwing', () => {
		expect(parseAcceptLanguage('en;q=banana,es;q=0.7')).toEqual([
			{ code: 'en', q: 1 },
			{ code: 'es', q: 0.7 },
		]);
	});

	it('clamps q to [0, 1]', () => {
		expect(parseAcceptLanguage('en;q=2,es;q=-1,fr;q=0.5')).toEqual([
			{ code: 'en', q: 1 },
			{ code: 'es', q: 0 },
			{ code: 'fr', q: 0.5 },
		]);
	});

	it('skips empty segments from stray commas', () => {
		expect(parseAcceptLanguage(',en,,,es;q=0.5,')).toEqual([
			{ code: 'en', q: 1 },
			{ code: 'es', q: 0.5 },
		]);
	});
});

describe('pickFromHeader', () => {
	it('returns null for empty input', () => {
		expect(pickFromHeader([])).toBeNull();
	});

	it('matches an exact supported code', () => {
		expect(pickFromHeader(parseAcceptLanguage('fr-FR,en;q=0.5'))).toBe(
			'fr',
		);
	});

	it('falls back from regional to base language', () => {
		// `pt-BR` is not supported; `pt` is.
		expect(pickFromHeader(parseAcceptLanguage('pt-BR,en;q=0.5'))).toBe(
			'pt',
		);
	});

	it('prefers higher q when both are supported', () => {
		expect(pickFromHeader(parseAcceptLanguage('en;q=0.5,es;q=0.9'))).toBe(
			'es',
		);
	});

	it('honours q=0 as an explicit rejection', () => {
		expect(pickFromHeader(parseAcceptLanguage('en;q=0,es;q=0.5'))).toBe(
			'es',
		);
	});

	it('returns null when no candidate is supported', () => {
		expect(pickFromHeader(parseAcceptLanguage('ko,ja;q=0.7,ru'))).toBe(
			'ja',
		);
	});

	it('breaks ties by source order (earlier wins)', () => {
		expect(pickFromHeader(parseAcceptLanguage('en;q=0.9,es;q=0.9'))).toBe(
			'en',
		);
	});

	it('matches multi-segment regions (e.g. zh-Hant-CN → zh)', () => {
		expect(pickFromHeader(parseAcceptLanguage('zh-Hant-CN,en;q=0.1'))).toBe(
			'zh',
		);
	});

	it('is case-insensitive on the code', () => {
		expect(pickFromHeader(parseAcceptLanguage('EN-US'))).toBe('en');
	});
});

describe('negotiateLocale (priority order)', () => {
	it('returns null when all inputs are absent', () => {
		expect(
			negotiateLocale({
				queryLang: null,
				cookieLang: null,
				acceptLanguage: null,
			}),
		).toEqual({ lang: null, source: null });
	});

	it('falls through to cookie when ?lang= is invalid (typo protection)', () => {
		expect(
			negotiateLocale({
				queryLang: 'xx',
				cookieLang: 'es',
				acceptLanguage: 'fr',
			}),
		).toEqual({ lang: 'es', source: 'cookie' });
	});

	it('uses query when supported, ignoring cookie + header', () => {
		expect(
			negotiateLocale({
				queryLang: 'de',
				cookieLang: 'es',
				acceptLanguage: 'fr-FR',
			}),
		).toEqual({ lang: 'de', source: 'query' });
	});

	it('falls back to cookie when query is missing', () => {
		expect(
			negotiateLocale({
				queryLang: null,
				cookieLang: 'it',
				acceptLanguage: 'fr-FR',
			}),
		).toEqual({ lang: 'it', source: 'cookie' });
	});

	it('falls back to header when both query and cookie are missing', () => {
		expect(
			negotiateLocale({
				queryLang: null,
				cookieLang: null,
				acceptLanguage: 'ja,en;q=0.5',
			}),
		).toEqual({ lang: 'ja', source: 'header' });
	});

	it('treats an unsupported cookie value as missing', () => {
		expect(
			negotiateLocale({
				queryLang: null,
				cookieLang: 'xx-YY',
				acceptLanguage: 'es',
			}),
		).toEqual({ lang: 'es', source: 'header' });
	});

	it('exposes the shared cookie name', () => {
		expect(LOCALE_COOKIE).toBe('mcp_vertex_locale');
		expect(localeCookieAttrs()).toContain('SameSite=Lax');
		expect(localeCookieAttrs()).toContain('max-age=31536000');
		expect(localeCookieAttrs()).toContain('path=/');
	});
});
