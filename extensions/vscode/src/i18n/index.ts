/**
 * Extension-side i18n surface — f00047 S6.
 *
 * This module is a thin re-export of `@mcp-vertex/shared/i18n`. The
 * shared package owns the `Lang` enum, the `ILangDict` contract, the
 * 12 merged language dictionaries, and the `dictsByLang` selector.
 * The extension host does not maintain a parallel set of dictionaries
 * anymore — S2 lifted them and S6 deleted the duplicates.
 *
 * The re-export keeps the old import path so the rest of the host
 * (commands, host adapter, etc.) continues to work without churn.
 */
import {
	languages as _languages,
	rtlLangs as _rtlLangs,
	defaultLang as _defaultLang,
	themes as _themes,
	flagFor as _flagFor,
	dictsByLang as _dictsByLang,
	type Lang as _Lang,
	type ILangMeta as _ILangMeta,
	type Theme as _Theme,
	type ILangDict as _ILangDict,
} from '@mcp-vertex/shared/i18n';

export const languages = _languages;
export const rtlLangs = _rtlLangs;
export const defaultLang = _defaultLang;
export const themes = _themes;
export const flagFor = _flagFor;
export const dictsByLang = _dictsByLang;
export type Lang = _Lang;
export type ILangMeta = _ILangMeta;
export type Theme = _Theme;
export type ILangDict = _ILangDict;

/** Convenience alias for the extension's flat translations shape. */
export type IExtensionTranslations = NonNullable<ILangDict['extension']> &
	Record<string, string>;

/** Convenience: the per-lang dictionary map (alias of `dictsByLang`). */
export type IExtensionDictionary = Record<Lang, IExtensionTranslations>;
