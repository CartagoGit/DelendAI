// Public entry point for the i18n subsystem.
//
// Layout:
//   - ./shared.ts      — types, language metadata, helpers (no translatable content)
//   - ./langs/<code>.ts — one file per language, each default-exporting a `LangDict`
//   - ./index.ts       — this file: aggregates every language into `dictsByLang`
//                         and re-exports the public surface.
//
// Consumers should import from `./i18n` (this file), not from `./i18n/shared`
// or `./i18n/ui`. The legacy `./i18n/ui` is kept as a thin re-export shim for
// one release so older `scripts/*.sh` and any caller still pointing there
// keeps working without an immediate code change.

import en from '#I18N/langs/en';
import es from '#I18N/langs/es';
import fr from '#I18N/langs/fr';
import de from '#I18N/langs/de';
import pt from '#I18N/langs/pt';
import it from '#I18N/langs/it';
import zh from '#I18N/langs/zh';
import hi from '#I18N/langs/hi';
import ar from '#I18N/langs/ar';
import ja from '#I18N/langs/ja';
import vi from '#I18N/langs/vi';
import th from '#I18N/langs/th';

import type { Lang, LangDict } from '#I18N/shared';
import { dictsByLang as _dictsByLang } from '#I18N/shared';

// Populate the shared `dictsByLang` map so `useTranslations()` can resolve any
// `Lang` to its dictionary. We intentionally mutate the object exported by
// `./shared` rather than maintaining a parallel map — keeping a single source
// of truth avoids drift between the language list and the loaded dictionaries.
(_dictsByLang as Record<Lang, LangDict>).en = en;
(_dictsByLang as Record<Lang, LangDict>).es = es;
(_dictsByLang as Record<Lang, LangDict>).fr = fr;
(_dictsByLang as Record<Lang, LangDict>).de = de;
(_dictsByLang as Record<Lang, LangDict>).pt = pt;
(_dictsByLang as Record<Lang, LangDict>).it = it;
(_dictsByLang as Record<Lang, LangDict>).zh = zh;
(_dictsByLang as Record<Lang, LangDict>).hi = hi;
(_dictsByLang as Record<Lang, LangDict>).ar = ar;
(_dictsByLang as Record<Lang, LangDict>).ja = ja;
(_dictsByLang as Record<Lang, LangDict>).vi = vi;
(_dictsByLang as Record<Lang, LangDict>).th = th;

export const dictsByLang = _dictsByLang as Readonly<Record<Lang, LangDict>>;

export {
	languages,
	defaultLang,
	useTranslations,
	flagFor,
	rtlLangs,
	themes,
} from '#I18N/shared';
export type {
	Lang,
	LangDict,
	ITranslations,
	INavTranslations,
	IHeroTranslations,
	IHeroTitle,
	IMarqueeTranslations,
	IConceptTranslations,
	IFeature,
	IInstallTranslations,
	IToolsTranslations,
	IBenchTranslations,
	IPluginsTranslations,
	ICfgTranslations,
	IFooterTranslations,
	IPluginPageTranslations,
	IPluginTranslations,
	ILogsTranslations,
	PluginKey,
	ILangMeta,
	Theme,
} from '#I18N/shared';
export { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';
export { logsByLang } from '#I18N/logs';
export { default as en } from '#I18N/langs/en';
export { default as es } from '#I18N/langs/es';
export { default as fr } from '#I18N/langs/fr';
export { default as de } from '#I18N/langs/de';
export { default as pt } from '#I18N/langs/pt';
export { default as it } from '#I18N/langs/it';
export { default as zh } from '#I18N/langs/zh';
export { default as hi } from '#I18N/langs/hi';
export { default as ar } from '#I18N/langs/ar';
export { default as ja } from '#I18N/langs/ja';
export { default as vi } from '#I18N/langs/vi';
export { default as th } from '#I18N/langs/th';
