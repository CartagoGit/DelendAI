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

import en from './langs/en';
import es from './langs/es';
import fr from './langs/fr';
import de from './langs/de';
import pt from './langs/pt';
import it from './langs/it';
import zh from './langs/zh';
import hi from './langs/hi';
import ar from './langs/ar';
import ja from './langs/ja';
import vi from './langs/vi';
import th from './langs/th';

import type { Lang, LangDict } from './shared';
import { dictsByLang as _dictsByLang } from './shared';

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
} from './shared';
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
	PluginKey,
	ILangMeta,
	Theme,
} from './shared';
export { default as en } from './langs/en';
export { default as es } from './langs/es';
export { default as fr } from './langs/fr';
export { default as de } from './langs/de';
export { default as pt } from './langs/pt';
export { default as it } from './langs/it';
export { default as zh } from './langs/zh';
export { default as hi } from './langs/hi';
export { default as ar } from './langs/ar';
export { default as ja } from './langs/ja';
export { default as vi } from './langs/vi';
export { default as th } from './langs/th';
