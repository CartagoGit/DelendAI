import { describe, expect, it } from 'vitest';

import { languageCodes } from '#I18N/shared';
import { proposalBoardByLang, proposalGlossaryByLang } from '#I18N/index';

/**
 * f00097 S6 — web-parity acceptance for the static `/[lang]/proposals` page.
 *
 * A full Astro SSR render needs the Astro runtime; the lightweight form pins
 * what actually breaks a locale at runtime: the page's two data sources
 * (`proposalBoardByLang` + `proposalGlossaryByLang`) must resolve for EVERY
 * supported language, and the board dict must carry every key the page reads.
 * Non-`en`/`es` locales fall back to the `en` object (the repo convention).
 */
const REQUIRED_KEYS = [
	'title',
	'lead',
	'statusesTitle',
	'kindsTitle',
	'chipsTitle',
	'filtersTitle',
	'recoverable',
	'detailTitle',
] as const;

describe('proposals web parity (f00097 S6)', () => {
	it('resolves the board + glossary dicts for all 12 languages', () => {
		expect(languageCodes.length).toBe(12);
		for (const lang of languageCodes) {
			expect(proposalBoardByLang[lang], `board ${lang}`).toBeDefined();
			expect(
				proposalGlossaryByLang[lang],
				`glossary ${lang}`,
			).toBeDefined();
		}
	});

	it('every board dict carries every key the page reads', () => {
		for (const lang of languageCodes) {
			const dict = proposalBoardByLang[lang];
			for (const key of REQUIRED_KEYS) {
				expect(dict[key], `${lang}.${key}`).toBeTruthy();
			}
			for (const f of ['status', 'text', 'tag'] as const) {
				expect(dict.filter[f], `${lang}.filter.${f}`).toBeTruthy();
			}
			for (const d of [
				'slices',
				'diagnose',
				'logs',
				'related',
			] as const) {
				expect(dict.detail[d], `${lang}.detail.${d}`).toBeTruthy();
			}
			for (const c of ['locks', 'stale', 'queue', 'health'] as const) {
				expect(dict.chips[c], `${lang}.chips.${c}`).toBeTruthy();
			}
		}
	});

	it('non-en/es locales fall back to the en object; es is its own', () => {
		for (const lang of languageCodes) {
			if (lang === 'en' || lang === 'es') continue;
			expect(proposalBoardByLang[lang]).toBe(proposalBoardByLang.en);
		}
		expect(proposalBoardByLang.es).not.toBe(proposalBoardByLang.en);
		expect(proposalBoardByLang.es.title).not.toBe(
			proposalBoardByLang.en.title,
		);
	});
});
