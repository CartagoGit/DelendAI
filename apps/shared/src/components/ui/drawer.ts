/**
 * `apps/shared/src/components/ui/drawer.ts` — host-agnostic
 * modal drawer / sheet (backdrop + side panel + close affordance
 * + slot for a brand mark + a link list + an optional footer).
 * Returns an HTML string.
 *
 * Replaces the markup portion of the mobile drawer in
 * `apps/web/src/components/SiteNav.astro` (f00102 S3.3) and is
 * designed to be reusable for any overlay-sheet pattern: the
 * VS Code extension's mobile-style settings sheet, a future
 * command palette, the marketing-site mobile menu, etc.
 *
 * Runtime contract
 * ----------------
 * The drawer ships as markup only. Hosts inject the
 * `data-drawer-open` / `data-drawer-close` glue in one of two
 * ways:
 *
 *   - Astro pages: include the `renderRuntime()` script from
 *     `@mcp-vertex/shared` once at the bottom of the layout; it
 *     wires `data-drawer-open` triggers (matching `[id]`) to
 *     toggle the `[hidden]` attribute and `data-open="true"`
 *     on the drawer root, and listens for `[data-drawer-close]`
 *     buttons, outside clicks on the backdrop, and `Escape`.
 *   - Extension webviews: same contract; the runtime glue is
 *     already injected via `extensions/vscode/src/dev/entry.ts`.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-drawer` plus `mv-drawer__*` and the
 *   `mv-drawer__panel--{left,right}` modifier. Legacy `.drawer*`
 *   selectors are kept in the companion SCSS via `@extend` so
 *   the docs site keeps emitting its existing markup without a
 *   rename (the wrapper Astro still wraps the result in
 *   `<div class="drawer mv-drawer" ...>` for the legacy alias
 *   tree).
 * - All `href` values are pre-resolved by the caller — the
 *   renderer never sees `import.meta.env` or relative paths.
 * - The `closeLabel` is the aria-label of the close button
 *   (e.g. "Close menu"); the visible glyph is the multiplication
 *   sign U+00D7 because no host ships a custom icon and the
 *   unicode char is the smallest possible cross-platform mark.
 */

export type DrawerSide = 'left' | 'right';

export interface IDrawerLink {
	readonly key?: string;
	readonly label: string;
	readonly href: string;
	/** When true, clicking the link dismisses the drawer (default true). */
	readonly closeOnClick?: boolean;
	/** When true, the link is rendered with `rel="external"` and
	 *  a `target="_blank"` hint. */
	readonly external?: boolean;
}

export interface IDrawerProps {
	/** DOM id of the drawer root. Must be unique per page. */
	readonly id: string;
	/** Accessible label for the dialog (`aria-label`). */
	readonly label: string;
	/** Brand mark rendered in the panel head. Pass-through to
	 *  `renderBrandMark` — `null` to omit. */
	readonly brand?: {
		readonly href: string;
		readonly logoSrc: string;
		readonly brandText: string;
		readonly logoWidth?: number;
		readonly logoHeight?: number;
	} | null;
	/** Link list rendered in the panel body. */
	readonly links: ReadonlyArray<IDrawerLink>;
	/** Accessible label of the close button (`aria-label`). */
	readonly closeLabel: string;
	/** Optional footer HTML (e.g. a settings CTA). Pass-through
	 *  via `<Fragment set:html>`-style escaping by the caller. */
	readonly footHtml?: string;
	/** Side the panel slides in from. Default `right`. */
	readonly side?: DrawerSide;
}

const escapeAttr = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

const renderBrand = (b: NonNullable<IDrawerProps['brand']>): string => {
	const w = b.logoWidth ?? 28;
	const h = b.logoHeight ?? 28;
	return (
		`<a class="mv-drawer__brand" href="${escapeAttr(b.href)}">` +
		`<img class="mv-drawer__logo" src="${escapeAttr(b.logoSrc)}"` +
		` width="${w}" height="${h}" alt="" loading="lazy" decoding="async" />` +
		`<strong class="mv-drawer__brand-text">${escapeAttr(b.brandText)}</strong>` +
		`</a>`
	);
};

/**
 * Options that shape the renderer's output without leaking host
 * concerns into the props themselves.
 */
export interface IRenderDrawerOptions {
	/** Extra classes to add to the root div (e.g. the docs site's
	 *  legacy `drawer` class so existing CSS keeps matching). */
	readonly className?: string;
	/** When true, emit only the panel + backdrop (no root div).
	 *  Hosts that need to control the root (e.g. Astro with
	 *  `transition:persist`) set this and render their own
	 *  wrapper. Default false (root is emitted). */
	readonly panelOnly?: boolean;
}

export const renderDrawer = (
	props: IDrawerProps,
	options: IRenderDrawerOptions = {},
): string => {
	const side = props.side ?? 'right';
	const extraCls = options.className ? ` ${options.className}` : '';
	const rootCls = `mv-drawer mv-drawer--${side}${extraCls}`;
	const linksHtml = props.links
		.map((l) => {
			const dataAttrs: string[] = [];
			if (l.key) dataAttrs.push(`data-nav-key="${escapeAttr(l.key)}"`);
			if (l.closeOnClick !== false) dataAttrs.push('data-drawer-link');
			const rel = l.external ? ' rel="external"' : '';
			return (
				`<a href="${escapeAttr(l.href)}"${rel} ${dataAttrs.join(' ')}>` +
				`${escapeAttr(l.label)}</a>`
			);
		})
		.join('');
	const brandHtml = props.brand ? renderBrand(props.brand) : '';
	const footHtml = props.footHtml
		? `<div class="mv-drawer__foot">${props.footHtml}</div>`
		: '';
	const body =
		`<div class="mv-drawer__backdrop" data-drawer-close></div>` +
		`<aside class="mv-drawer__panel mv-drawer__panel--${side}">` +
		`<div class="mv-drawer__head">` +
		brandHtml +
		`<button class="mv-drawer__close" data-drawer-close` +
		` aria-label="${escapeAttr(props.closeLabel)}" type="button">` +
		`<svg viewBox="0 0 24 24" width="22" height="22" fill="none"` +
		` stroke="currentColor" stroke-width="2" stroke-linecap="round"` +
		` aria-hidden="true">` +
		`<path d="M6 6l12 12M18 6L6 18"></path>` +
		`</svg>` +
		`</button>` +
		`</div>` +
		`<nav class="mv-drawer__links" aria-label="${escapeAttr(props.label)}">` +
		linksHtml +
		`</nav>` +
		footHtml +
		`</aside>`;
	if (options.panelOnly) {
		return body;
	}
	return (
		`<div class="${rootCls}" id="${escapeAttr(props.id)}" role="dialog"` +
		` aria-modal="true" aria-label="${escapeAttr(props.label)}" hidden>` +
		body +
		`</div>`
	);
};
