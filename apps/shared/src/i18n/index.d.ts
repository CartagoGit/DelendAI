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
export type { ISettingsTranslations } from '../contracts/interfaces/settings-translations.interface';
export {
	languages,
	rtlLangs,
	defaultLang,
	themes,
	flagFor,
	t,
	settingsTranslations,
} from './shared';
import type { LangDictByLang } from './shared';
export declare const dictsByLang: LangDictByLang;
