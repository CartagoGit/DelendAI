/**
 * `apps/shared/src/components/ui/brand-mark.ts` — host-agnostic
 * brand mark (logo + brand text inside a link). Returns an HTML
 * string.
 *
 * Replaces the markup portion of:
 *   - `apps/web/src/components/SiteNav.astro` `.nav__brand` block
 *     and its mobile-drawer head
 *   - `apps/web/src/components/SiteFooter.astro` brand column
 *
 * The shape is small enough that the docs site, the VS Code
 * extension welcome/settings panels, and any future surface can
 * all stamp the same visual identity without re-implementing the
 * markup. The wrapper Astro / extension glue passes the
 * already-resolved `logoSrc` and `href` so this stays free of
 * `import.meta.env`.
 *
 * Conventions
 * -----------
 * - Class namespace: `delendai-brand` plus `delendai-brand__logo`,
 *   `delendai-brand__text`, and the optional `delendai-brand--{pill,plain}`
 *   variant modifier. Legacy `.nav__brand` / `.drawer__logo`
 *   selectors are kept in the companion SCSS via `@extend`.
 * - The image is `loading="lazy"` and `decoding="async"` so the
 *   first paint is not blocked by the brand logo (which is usually
 *   <5 KB SVG).
 * - The brand text is rendered inside a `<span>` so it can be
 *   hidden via CSS (`text-indent: -9999px`) on tight widths
 *   without losing the accessible name. Hosts that want a
 *   logo-only mark pass `brandText: ''` and rely on the `aria-label`
 *   attribute on the wrapper link.
 */

import { escapeAttr } from '../../lib/escape';

export type BrandMarkVariant = 'pill' | 'plain';

export interface IBrandMarkProps {
	/** Destination of the wrapping link. */
	readonly href: string;
	/** Absolute or base-prefixed URL of the logo image. */
	readonly logoSrc: string;
	/** Accessible name of the logo image; usually empty (`alt=""`)
	 *  because the wrapping link already carries the brand name. */
	readonly logoAlt?: string;
	/** Brand text shown next to the logo (e.g. `@delendai`). */
	readonly brandText: string;
	/** Intrinsic width of the logo in pixels. Default `26`. */
	readonly logoWidth?: number;
	/** Intrinsic height of the logo in pixels. Default `26`. */
	readonly logoHeight?: number;
	/** Visual variant. `pill` (default) shows the rounded
	 *  background-hover affordance; `plain` is for tight spaces
	 *  like the drawer head where the pill padding is unwanted. */
	readonly variant?: BrandMarkVariant;
}

export const renderBrandMark = (props: IBrandMarkProps): string => {
	const variant = props.variant ?? 'pill';
	const width = props.logoWidth ?? 26;
	const height = props.logoHeight ?? 26;
	const alt = props.logoAlt ?? '';
	const cls = `delendai-brand delendai-brand--${variant}`;
	return (
		`<a class="${cls}" href="${escapeAttr(props.href)}">` +
		`<img class="delendai-brand__logo" src="${escapeAttr(props.logoSrc)}"` +
		` width="${width}" height="${height}" alt="${escapeAttr(alt)}"` +
		` loading="lazy" decoding="async" />` +
		`<span class="delendai-brand__text">${escapeAttr(props.brandText)}</span>` +
		`</a>`
	);
};
