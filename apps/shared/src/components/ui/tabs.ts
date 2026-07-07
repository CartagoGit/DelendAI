/**
 * `apps/shared/src/components/ui/tabs.ts` — host-agnostic tab trigger
 * strip (the `<nav role="tablist">` portion of an ARIA-correct Tabs
 * widget). Returns an HTML string.
 *
 * Replaces the tab-trigger portion of
 * `apps/web/src/components/ui/Tabs.astro` (f00048 S1 / f00069 S2)
 * for any host that needs an accessible tab strip. The `.astro`
 * wrapper that calls into this module is now a 6-line shim; the
 * `<section class="mv-tabs">` wrapper + the `<slot name="panels">`
 * stay in the Astro world because Astro slots cannot be serialised
 * into a string by JS — only the markup that does NOT depend on
 * children lives here.
 *
 * The host must:
 *   1. Render the result of `renderTabs(...)` inside a
 *      `<section class="mv-tabs">` (or `ui-tabs` for the legacy
 *      alias) so the BEM scoping stays consistent.
 *   2. Provide one `<section data-tab-panel={id} hidden={...}>` per
 *      tab id; the keyboard / click glue (in apps/web only) toggles
 *      `hidden` based on `data-tab-trigger` matches.
 *
 * Conventions
 * -----------
 * - Class names use the shared `mv-*` BEM namespace. Legacy
 *   `ui-tabs*` selectors live in the companion SCSS via `@extend`.
 * - Variants: `underline` (default), `pill`, `plugin` — matches the
 *   `apps/web` install page and plugin-listing chrome.
 * - The optional `icon` is rendered as an 18×18 `<img>` with
 *   `loading="lazy"` + a JS inline `onerror` fallback that swaps in
 *   a `<span class="mv-tabs__icon mv-tabs__icon--fallback">` with
 *   the first letter of the tab id, so broken icon URLs still show
 *   a meaningful affordance.
 * - Returns HTML only. No script. The runtime glue that wires the
 *   keyboard / roving tabindex lives in apps/web (see
 *   `_tabs-controller.ts`) and in `renderRuntime` from
 *   `@mcp-vertex/shared` for the data-mv-* gestures.
 */

export interface ITabItem {
	readonly id: string;
	readonly label: string;
	/** Optional numeric / status badge displayed after the label. */
	readonly badge?: string;
	/** Optional icon path (e.g. `/logos/plugin-proposals.svg`). */
	readonly icon?: string;
}

export type TabsVariant = 'underline' | 'pill' | 'plugin';

export interface ITabsProps {
	readonly tabs: ReadonlyArray<ITabItem>;
	/** Visible tab on first render. Defaults to `tabs[0].id`. */
	readonly defaultTab?: string;
	readonly variant?: TabsVariant;
	/** Accessible label for the tablist (`aria-label`). */
	readonly label?: string;
}

const escapeAttr = (raw: string): string =>
	raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const escapeText = (raw: string): string =>
	raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const escapeJsString = (raw: string): string =>
	raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

const renderIcon = (icon: string | undefined, id: string): string => {
	if (!icon) return '';
	const safeIcon = escapeAttr(icon);
	const safeId = escapeJsString(id);
	return (
		`<img class="mv-tabs__icon" src="${safeIcon}" width="18" height="18" alt="" ` +
		`loading="lazy" decoding="async" data-tab-id="${escapeAttr(id)}" ` +
		`onerror="this.replaceWith(Object.assign(document.createElement('span'),` +
		`{className:'mv-tabs__icon mv-tabs__icon--fallback',textContent:(${safeId}).charAt(0)}))" />`
	);
};

const renderBadge = (badge: string | undefined): string =>
	badge ? `<span class="mv-tabs__badge">${escapeText(badge)}</span>` : '';

/**
 * Render the tablist `<nav>` portion of a Tabs widget as a string.
 *
 * The caller is expected to:
 *   1. Wrap this in `<section class="mv-tabs ui-tabs mv-tabs--{variant}" data-ui-tabs data-default-tab="{initial}">`.
 *   2. Provide the panels below via `<div class="mv-tabs__panels">…</div>` containing
 *      `<section role="tabpanel" id="mv-panel-{id}" data-tab-panel="{id}" hidden>…</section>` blocks.
 *
 * The shared wrapper (`apps/web/src/components/ui/Tabs.astro`) handles
 * these for the docs site. Other hosts bring their own glue.
 */
export const renderTabs = (props: ITabsProps): string => {
	const { tabs, defaultTab, label = 'Sections' } = props;
	const variant: TabsVariant = props.variant ?? 'underline';
	const initial = defaultTab ?? tabs[0]?.id ?? '';

	const tabButtons = tabs
		.map((t) => {
			const isActive = t.id === initial;
			const ariaSelected = isActive ? 'true' : 'false';
			const tabindex = isActive ? 0 : -1;
			return (
				`<li role="presentation">` +
				`<button type="button" role="tab" ` +
				`id="mv-tab-${escapeAttr(t.id)}" ` +
				`class="mv-tabs__tab" ` +
				`data-tab-trigger="${escapeAttr(t.id)}" ` +
				`aria-selected="${ariaSelected}" ` +
				`aria-controls="mv-panel-${escapeAttr(t.id)}" ` +
				`tabindex="${tabindex}">` +
				renderIcon(t.icon, t.id) +
				`<span class="mv-tabs__label">${escapeText(t.label)}</span>` +
				renderBadge(t.badge) +
				`</button>` +
				`</li>`
			);
		})
		.join('');

	return (
		`<nav class="mv-tabs__bar" aria-label="${escapeText(label)}" data-tabs-variant="${escapeAttr(variant)}">` +
		`<ul role="tablist" class="mv-tabs__list">${tabButtons}</ul>` +
		`</nav>`
	);
};
