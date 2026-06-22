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

import type { ILangDict, Lang, LangDictByLang } from './shared';
import ar from './langs/ar';
import de from './langs/de';
import en from './langs/en';
import es from './langs/es';
import fr from './langs/fr';
import hi from './langs/hi';
import it from './langs/it';
import ja from './langs/ja';
import pt from './langs/pt';
import th from './langs/th';
import vi from './langs/vi';
import zh from './langs/zh';

export const dictsByLang: LangDictByLang = {
	ar,
	de,
	en,
	es,
	fr,
	hi,
	it,
	ja,
	pt,
	th,
	vi,
	zh,
} as Record<Lang, ILangDict> as LangDictByLang;
