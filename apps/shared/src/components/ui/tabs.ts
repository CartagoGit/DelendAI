/**
 * `apps/shared/src/components/ui/tabs.ts` — host-agnostic tab trigger
 * strip (the `<nav role="tablist">` portion of an ARIA-correct Tabs
 * widget). Returns an HTML string.
 *
 * Replaces the tab-trigger portion of
 * `apps/web/src/components/ui/Tabs.astro` (f00048 S1 / f00069 S2)
 * and the dashboard tabbar in `packages/ui-extension/src/dashboard/
 * builders/build-tabs-bar.ts` (f00102 S4-real-extract) for any host
 * that needs an accessible tab strip. The `.astro` wrapper that
 * calls into this module is now a 6-line shim; the
 * `<section class="mcpv-tabs">` wrapper + the `<slot name="panels">`
 * stay in the Astro world because Astro slots cannot be serialised
 * into a string by JS — only the markup that does NOT depend on
 * children lives here.
 *
 * The host must:
 *   1. Render the result of `renderTabs(...)` inside a
 *      `<section class="mcpv-tabs">` (or `ui-tabs` for the legacy
 *      alias) so the BEM scoping stays consistent.
 *   2. Provide one `<section data-tab-panel={id} hidden={...}>` per
 *      tab id; the keyboard / click glue (in apps/web only) toggles
 *      `hidden` based on `data-tab-trigger` matches.
 *
 * Conventions
 * -----------
 * - Class names use the shared `mcpv-*` BEM namespace. Legacy
 *   `ui-tabs*` selectors live in the companion SCSS via `@extend`.
 * - Variants: `underline` (default), `pill`, `plugin` — matches the
 *   `apps/web` install page and plugin-listing chrome.
 * - The optional `icon` is rendered as an 18×18 `<img>` with
 *   `loading="lazy"` + a JS inline `onerror` fallback that swaps in
 *   a `<span class="mcpv-tabs__icon mcpv-tabs__icon--fallback">` with
 *   the first letter of the tab id, so broken icon URLs still show
 *   a meaningful affordance.
 * - `idPrefix` lets the dashboard emit `id="tab-{id}"` /
 *   `aria-controls="panel-{id}"` to keep its existing test
 *   selectors and SCSS rules working without a rewrite. Default
 *   is the docs-site convention (`mcpv-tab-` / `mcpv-panel-`).
 * - `actionHtml` is a passthrough rendered inside the `<li>` list
 *   AFTER the real tabs (e.g. the dashboard's refresh button).
 *   It is intentionally NOT a tab (no `role="tab"`, no
 *   `data-tab-trigger`) so it stays out of the roving-tabindex
 *   keyboard navigation.
 * - Returns HTML only. No script. The runtime glue that wires the
 *   keyboard / roving tabindex lives in apps/web (see
 *   `_tabs-controller.ts`) and in `renderRuntime` from
 *   `@delendai/shared` for the data-mcpv-* gestures.
 */
import { escapeAttr } from '../../lib/escape';

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
	/** Override the default `mcpv-` id prefix. The docs site uses
	 *  `mcpv-tab-{id}` / `mcpv-panel-{id}`; the dashboard uses
	 *  `tab-{id}` / `panel-{id}` to keep its existing CSS +
	 *  client-script selectors working. Default `mcpv-`. */
	readonly idPrefix?: string;
	/** Extra `<li>` content rendered after the real tabs. Used
	 *  by the dashboard for the refresh button (action, not a
	 *  tab). Default empty. */
	readonly actionHtml?: string;
}

const escapeText = (raw: string): string =>
	raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const renderIcon = (icon: string | undefined, id: string): string => {
	if (!icon) return '';
	const safeIcon = escapeAttr(icon);
	// f00099-style audit follow-up (was inline `onerror=`): the
	// renderer never emits executable JavaScript. Instead, it
	// stamps a `data-tab-icon` wrapper around both the `<img>` and
	// a text fallback span. The runtime glue (the host's tabs
	// controller + `renderRuntime` from `@delendai/shared`) adds
	// the `is-broken` class on `error`, and the companion SCSS
	// hides the `<img>` + reveals the fallback. See
	// `apps/web/src/components/ui/_tabs-controller.ts` and
	// `packages/ui-extension/src/components/runtime.ts` for the
	// glue (both already target `[data-mcpv-toggle]` /
	// `[data-mcpv-action]`; this is the same pattern with a
	// dedicated `data-mcpv-icon` selector).
	const safeId = escapeAttr(id);
	const firstLetter = id.charAt(0).toUpperCase();
	return (
		`<span class="mcpv-tabs__icon" data-mcpv-icon data-tab-id="${safeId}">` +
		`<img src="${safeIcon}" width="18" height="18" alt=""` +
		` loading="lazy" decoding="async" />` +
		`<span class="mcpv-tabs__icon-fallback" aria-hidden="true">${escapeText(firstLetter)}</span>` +
		`</span>`
	);
};

const renderBadge = (badge: string | undefined): string =>
	badge ? `<span class="mcpv-tabs__badge">${escapeText(badge)}</span>` : '';

/**
 * Render the tablist `<nav>` portion of a Tabs widget as a string.
 *
 * The caller is expected to:
 *   1. Wrap this in `<section class="mcpv-tabs ui-tabs mcpv-tabs--{variant}" data-ui-tabs data-default-tab="{initial}">`.
 *   2. Provide the panels below via `<div class="mcpv-tabs__panels">…</div>` containing
 *      `<section role="tabpanel" id="mcpv-panel-{id}" data-tab-panel="{id}" hidden>…</section>` blocks.
 *
 * The shared wrapper (`apps/web/src/components/ui/Tabs.astro`) handles
 * these for the docs site. Other hosts bring their own glue.
 */
export const renderTabs = (props: ITabsProps): string => {
	const {
		tabs,
		defaultTab,
		label = 'Sections',
		idPrefix = 'mcpv-',
		actionHtml = '',
	} = props;
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
				`id="${escapeAttr(idPrefix)}tab-${escapeAttr(t.id)}" ` +
				`class="mcpv-tabs__tab" ` +
				`data-tab-trigger="${escapeAttr(t.id)}" ` +
				`aria-selected="${ariaSelected}" ` +
				`aria-controls="${escapeAttr(idPrefix)}panel-${escapeAttr(t.id)}" ` +
				`tabindex="${tabindex}">` +
				renderIcon(t.icon, t.id) +
				`<span class="mcpv-tabs__label">${escapeText(t.label)}</span>` +
				renderBadge(t.badge) +
				`</button>` +
				`</li>`
			);
		})
		.join('');
	const actionLi = actionHtml
		? `<li role="presentation" class="mcpv-tabs__action">${actionHtml}</li>`
		: '';

	return (
		`<nav class="mcpv-tabs__bar" aria-label="${escapeText(label)}" data-tabs-variant="${escapeAttr(variant)}">` +
		`<ul role="tablist" class="mcpv-tabs__list">${tabButtons}${actionLi}</ul>` +
		`</nav>`
	);
};
