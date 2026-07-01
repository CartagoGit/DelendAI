/**
 * page.ts — shared building blocks for every Astro page in `apps/web`.
 *
 * The site is a 12-language static build (`outDir: build/apps/web/`,
 * GitHub Pages, 12 locales). Every page is duplicated once for English
 * (at the root) and once for every other locale (at `/<lang>/`). That
 * 12× boilerplate was starting to grow; this module collects the bits
 * every page repeats so adding a new section is one entry in the
 * `page-manifest.ts` (see below) and zero new `.astro` files.
 *
 * Three primitives:
 *   - `langStaticPaths()` — the standard `getStaticPaths` payload for
 *     a translated page (one entry per non-English locale).
 *   - `resolveLang(lang, fallback?)` — runtime guard so a stale build
 *     cache or a manual URL never renders with `lang="undefined"`.
 *   - `localePath(lang, segment, base?)` — helper to build in-site
 *     hrefs that prepend the active locale (English = no prefix,
 *     matching `prefixDefaultLocale: false` in `astro.config.mjs`).
 *
 * The `PageShell` component below is the *visual* counterpart: it
 * composes `<Base>` + `<PageHeader>` + a slot, so a translated page is
 * `getStaticPaths + resolveLang + PageShell` instead of `getStaticPaths
 * + lang guard + Base + manual breadcrumb + manual h1`. Every page
 * still owns its body (the slot), the manifest just removes the
 * shell boilerplate.
 */
import { languages, defaultLang, type Lang } from '#I18N/ui';

export { languages, defaultLang };
export type { Lang };

/**
 * `getStaticPaths` payload for a translated page: one entry per
 * non-English locale. The English copy always lives at the root
 * (the project-site URL stays clean, see `astro.config.mjs#i18n`).
 *
 * Use it as the literal `getStaticPaths` return:
 *
 *   export const getStaticPaths = () => langStaticPaths();
 */
export const langStaticPaths = (): Array<{ params: { lang: string } }> =>
	languages
		.filter((l) => l.code !== defaultLang)
		.map((l) => ({ params: { lang: l.code } }));

/**
 * Resolve the active locale from a raw URL param. `fallback` defaults
 * to `defaultLang` (English) so a stale build cache or a manual URL
 * never renders with `lang="undefined"`. Same pattern every translated
 * page already uses inline; this centralises it.
 */
export const resolveLang = (
	raw: unknown,
	fallback: Lang = defaultLang as Lang,
): Lang => {
	const candidate = typeof raw === 'string' ? raw : '';
	return languages.some((l) => l.code === candidate)
		? (candidate as Lang)
		: fallback;
};

/**
 * Build an in-site href for the current locale. English has no
 * prefix; every other locale gets `/<lang>` prepended. The returned
 * string starts AND ends with `/` so concatenation with
 * `import.meta.env.BASE_URL` is safe.
 *
 *   localePath('en', 'tools')    -> '/tools'
 *   localePath('en', '/tools/')  -> '/tools/'
 *   localePath('es', 'tools')    -> '/es/tools'
 *   localePath('es', '/')        -> '/es/'
 */
export const localePath = (lang: Lang, segment: string, base = ''): string => {
	const trimmedBase = base.replace(/\/$/, '');
	const trimmedSeg = segment.replace(/^\//, '').replace(/\/$/, '');
	const localePrefix = lang === defaultLang ? '' : `/${lang}`;
	const tail = trimmedSeg ? `/${trimmedSeg}` : '';
	// Preserve the trailing slash when the caller asked for the root.
	const wantsRoot =
		segment === '' || segment === '/' || segment.endsWith('/');
	return `${trimmedBase}${localePrefix}${tail}${wantsRoot && !tail ? '/' : ''}`;
};

/**
 * Inverse of `localePath`: given a path on the current URL, return the
 * segment portion without the locale prefix. Useful when the locale
 * changes (a language switch has to rewrite every in-page link).
 */
export const stripLocale = (path: string): string => {
	const segs = path.split('/').filter(Boolean);
	if (
		segs[0] &&
		languages.some((l) => l.code === segs[0]) &&
		segs[0] !== defaultLang
	) {
		return '/' + segs.slice(1).join('/');
	}
	return path || '/';
};
