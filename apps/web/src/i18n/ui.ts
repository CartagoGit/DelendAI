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

import type { ITranslations, Lang } from '#I18N/index';
import { useTranslations as _useTranslationsObject } from '#I18N/index';

export type {
	ITranslations,
	INavTranslations,
	IHeroTranslations,
	IHeroTitle,
	IMarqueeTranslations,
	IConceptTranslations,
	IFeature,
	IToolsTranslations,
	IBenchTranslations,
	IPluginsTranslations,
	ICfgTranslations,
	IFooterTranslations,
	IPluginPageTranslations,
	IPluginTranslations,
	ILogsTranslations,
	Lang,
	LangDict,
	PluginKey,
} from '#I18N/index';
export type { ILangMeta, Theme } from '#I18N/index';
export {
	dictsByLang,
	defaultLang,
	languages,
	rtlLangs,
	themes,
} from '#I18N/index';

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
	const callFn = (...parts: ReadonlyArray<string>): string | undefined => {
		const path = parts
			.flatMap((p) => (typeof p === 'string' ? p.split('.') : []))
			.filter((s) => s.length > 0);
		if (path.length === 0) return undefined;
		let cur: unknown = resolved;
		for (const seg of path) {
			if (
				cur &&
				typeof cur === 'object' &&
				seg in (cur as Record<string, unknown>)
			) {
				cur = (cur as Record<string, unknown>)[seg];
			} else {
				// Miss (x00007 S6): the key is not in the active dict nor in
				// the English fallback. We return `undefined` so call
				// sites that care about misses (e.g. `PluginsSection.astro`
				// looking up `plugin.<slug>` descriptions) can fall back
				// to a richer source — the live tool registry
				// (`capabilities.json`) — instead of leaking the raw
				// dot-notation key on screen.  The default return type is
				// widened to `string | undefined`; consumers that do
				// `t('nav.concept')` as a string still get a string when
				// the key exists, and `?? 'fallback'` patterns work.
				return undefined;
			}
		}
		return typeof cur === 'string' ? cur : undefined;
	};
	// Attach the function to the resolved object so callers can do `t.nav.concept`
	// (object access) and `t("nav.concept")` (call access) on the same value.
	return Object.assign(callFn, resolved) as TranslatorCompat;
};
