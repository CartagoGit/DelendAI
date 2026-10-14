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
	/** Override the default `delendai-` id prefix. The docs site uses
	 *  `delendai-tab-{id}` / `delendai-panel-{id}`; the dashboard uses
	 *  `tab-{id}` / `panel-{id}` to keep its existing CSS +
	 *  client-script selectors working. Default `delendai-`. */
	readonly idPrefix?: string;
	/** Extra `<li>` content rendered after the real tabs. Used
	 *  by the dashboard for the refresh button (action, not a
	 *  tab). Default empty. */
	readonly actionHtml?: string;
}
/**
 * Render the tablist `<nav>` portion of a Tabs widget as a string.
 *
 * The caller is expected to:
 *   1. Wrap this in `<section class="delendai-tabs ui-tabs delendai-tabs--{variant}" data-ui-tabs data-default-tab="{initial}">`.
 *   2. Provide the panels below via `<div class="delendai-tabs__panels">…</div>` containing
 *      `<section role="tabpanel" id="delendai-panel-{id}" data-tab-panel="{id}" hidden>…</section>` blocks.
 *
 * The shared wrapper (`apps/web/src/components/ui/Tabs.astro`) handles
 * these for the docs site. Other hosts bring their own glue.
 */
export declare const renderTabs: (props: ITabsProps) => string;
