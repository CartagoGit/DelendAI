/**
 * `apps/shared/src/components/ui/page-header.ts` — host-agnostic
 * page intro: breadcrumb + page <h1>. Returns an HTML string.
 *
 * Replaces `apps/web/src/components/PageHeader.astro` (f00102 S3.1)
 * for any host that needs a uniform page-header block. Astro
 * View Transitions (`transition:name`, `transition:animate`) live
 * ONLY in the Astro wrapper — the shared string does not embed
 * them so non-Astro hosts (extension webviews, etc.) get a plain
 * <h1> that morphs naturally inside their own transitions API.
 *
 * Conventions
 * -----------
 * - `baseHref` is required: the host computes its base URL (Astro
 *   reads `import.meta.env.BASE_URL`, the extension computes it
 *   from its own state) and passes it explicitly. The shared
 *   component is **never** responsible for `import.meta.env`.
 * - Crumbs are rendered left-to-right. The last element is the
 *   current page (`<span aria-current="page">`); earlier items
 *   are anchored. A "Home" crumb is added automatically when the
 *   caller does not pass one explicitly.
 * - Class namespace: `mcpv-page-header` (root), `mcpv-page-header__*`
 *   for children. The companion SCSS keeps the legacy
 *   `.page-header` selector via `@extend` so existing markup on
 *   the docs site keeps working.
 */

import type { Lang } from '../../i18n/shared';

export interface ICrumb {
	readonly label: string;
	readonly href: string;
}

export interface IPageHeaderProps {
	readonly lang: Lang;
	/**
	 * Localized page title. Use the i18n key directly, e.g.
	 * `t.tools.title`. The shared renderer does not look up
	 * translations.
	 */
	readonly title: string;
	/**
	 * Optional breadcrumb trail. The last element is the current
	 * page (rendered as `<span aria-current="page">`). Earlier
	 * items are rendered as `<a>` elements. Pass `undefined` or
	 * an empty array to omit breadcrumbs entirely.
	 */
	readonly crumbs?: ReadonlyArray<ICrumb>;
	/**
	 * Path prefix used to build the "Home" link. Required.
	 * Hosts compute it: Astro pages pass
	 * `import.meta.env.BASE_URL.replace(/\/$/, '') + '/'`;
	 * the extension passes its panel URL base.
	 */
	readonly baseHref: string;
	/**
	 * Localized label for the "Home" crumb. The shared renderer
	 * does not look up translations; the host passes the
	 * already-translated string. Default: "Home".
	 */
	readonly homeLabel?: string;
}

import { escapeAttr, escapeHtml } from '../../lib/escape';

const renderCrumbs = (
	crumbs: ReadonlyArray<ICrumb>,
	homeHref: string,
	homeLabel: string,
): string => {
	const full: ReadonlyArray<ICrumb> = [
		{ label: homeLabel, href: homeHref },
		...crumbs,
	];
	if (full.length < 2) return '';

	const items = full
		.map((c, i) => {
			const sep = i > 0 ? `<span aria-hidden="true">›</span>` : '';
			const body =
				i < full.length - 1
					? `<a href="${escapeAttr(c.href)}">${escapeHtml(c.label)}</a>`
					: `<span aria-current="page">${escapeHtml(c.label)}</span>`;
			return sep + body;
		})
		.join('');

	return `<nav class="mcpv-page-header__crumb" aria-label="breadcrumb">${items}</nav>`;
};

/**
 * Render the page-header markup as a string.
 *
 * The host wraps the result in `<header class="mcpv-page-header">…</header>`
 * to keep the structural scope intact, and may opt in to Astro
 * View Transitions for the `<h1>` by adding `transition:name` /
 * `transition:animate` to the rendered element if it ships inside
 * an Astro `<PageHeader>` wrapper.
 *
 * @example
 *   renderPageHeader({
 *     lang: 'es',
 *     title: 'Recursos',
 *     crumbs: [{ label: 'Inicio', href: '/es/' }, { label: 'Recursos', href: '' }],
 *     baseHref: '/es/',
 *     homeLabel: 'Inicio',
 *   })
 */
export const renderPageHeader = (props: IPageHeaderProps): string => {
	const homeLabel = props.homeLabel ?? 'Home';
	const crumbs = props.crumbs ?? [];
	const baseHref = props.baseHref;
	const crumbsHtml = renderCrumbs(crumbs, baseHref, homeLabel);

	return (
		`<div class="mcpv-page-header__inner">` +
		crumbsHtml +
		`<h1 class="mcpv-page-header__title">${escapeHtml(props.title)}</h1>` +
		`</div>`
	);
};
