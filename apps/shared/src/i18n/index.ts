/**
 * Public i18n entry point for `@mcp-vertex/shared/i18n`.
 *
 * S1 ships the metadata + helpers + the `ILangDict` contract. S2 fills
 * `dictsByLang` with the 12 merged language dictionaries (one per
 * `Lang`) and the per-language files under `langs/`.
 */
export type {
	Lang,
	ILangMeta,
	Theme,
	ILangDict,
	ISiteTranslations,
	IExtensionTranslations,
	IToolTranslations,
	LangDictByLang,
} from './shared';
export {
	languages,
	rtlLangs,
	defaultLang,
	themes,
	flagFor,
	t,
} from './shared';

// Populated by S2 — kept as a `Record` so the barrel can re-export the
// map before S2 lands. S2 replaces this stub with the real merged
// dictionaries imported from `./langs/<code>.ts`.
import type { ILangDict, Lang, LangDictByLang } from './shared';

const stub = (): ILangDict => ({
	site: {} as ILangDict['site'],
	extension: {} as ILangDict['extension'],
	tools: {},
});

export const dictsByLang: LangDictByLang = {
	ar: stub(),
	de: stub(),
	en: stub(),
	es: stub(),
	fr: stub(),
	hi: stub(),
	it: stub(),
	ja: stub(),
	pt: stub(),
	th: stub(),
	vi: stub(),
	zh: stub(),
} as Record<Lang, ILangDict> as LangDictByLang;
