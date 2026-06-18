// Backwards-compatibility shim.
//
// The canonical location for the i18n module is `./i18n/index.ts`. New code
// should import from there directly and use the nested-object form
// (`t.nav.concept`, `t.hero.title.a`, …) which is type-checked against
// `ITranslations`.
//
// This file exists so existing call sites — currently a few `.astro` pages
// still using `t('nav.concept')` — keep working during the migration. It
// exports the same surface as `./index.ts` plus a legacy `useTranslations`
// overload that returns a callable proxy: both `t('nav.concept')` and
// `t.nav.concept` work. Remove once every consumer is migrated.

import type { ITranslations, Lang } from './index';
import { useTranslations as _useTranslationsObject } from './index';

export type {
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
	Lang,
	LangDict,
	PluginKey,
} from './index';
export type { ILangMeta, Theme } from './index';
export { dictsByLang, defaultLang, languages, rtlLangs, themes } from './index';

/**
 * Legacy entry point: returns a `Translator` object that is **also** callable.
 *
 *   const t = useTranslations("es");
 *   t.nav.concept;          // "Concepto"   (new, typed)
 *   t("nav.concept");       // "Concepto"   (legacy, dot-string)
 *   t("nav", "concept");    // "Concepto"   (legacy, variadic)
 *
 * The proxy is built once per call and looks up leaves against `ITranslations`,
 * falling back to English when a key is missing so the page still renders.
 */
export const useTranslations = (lang: Lang): TranslatorCompat => {
	const resolved: ITranslations = _useTranslationsObject(lang);
	return makeTranslatorCompat(resolved);
};

type TranslatorCompat = ITranslations &
	((...parts: ReadonlyArray<string>) => string);

const makeTranslatorCompat = (resolved: ITranslations): TranslatorCompat => {
	const callFn = (...parts: ReadonlyArray<string>): string => {
		const path = parts
			.flatMap((p) => (typeof p === 'string' ? p.split('.') : []))
			.filter((s) => s.length > 0);
		let cur: unknown = resolved;
		for (const seg of path) {
			if (
				cur &&
				typeof cur === 'object' &&
				seg in (cur as Record<string, unknown>)
			) {
				cur = (cur as Record<string, unknown>)[seg];
			} else {
				return path.join('.');
			}
		}
		return typeof cur === 'string' ? cur : path.join('.');
	};
	// Attach the function to the resolved object so callers can do `t.nav.concept`
	// (object access) and `t("nav.concept")` (call access) on the same value.
	return Object.assign(callFn, resolved) as TranslatorCompat;
};
