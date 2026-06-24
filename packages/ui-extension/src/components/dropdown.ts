/**
 * `Dropdown` — webview-agnostic dropdown menu with CSS-only transition
 * (`transform` + `opacity`, 180ms ease-out via `--mv-transition-base`).
 * Closes on outside-click and on `Esc` via the runtime (see
 * `components/runtime.ts`).
 *
 * Renders as a `<details>`-like structure with explicit `aria-*`
 * attributes for a11y. The menu items carry `data-mv-action` so the
 * runtime can delegate clicks to the host.
 */
import { escapeHtml } from '../dashboard/format';

export interface IDropdownItem {
	readonly id: string;
	readonly label: string;
	readonly icon?: string;
}

export interface IDropdownOptions {
	readonly id: string; // unique DOM id; used by the outside-click handler
	readonly label: string;
	readonly items: readonly IDropdownItem[];
	readonly align?: 'left' | 'right';
	/**
	 * Optional id prefix used to build the DOM ids of the trigger / menu
	 * / wrapper. When set, the wrapper id becomes `${idPrefix}`, the
	 * trigger id becomes `${idPrefix}-trigger` and the menu id becomes
	 * `${idPrefix}-menu` — which is what hosts with their own JS/CSS
	 * contracts need (e.g. the docs site passes `idPrefix: 'nav-more'`
	 * so its `SiteNav.astro` JS can query `#nav-more-trigger` /
	 * `#nav-more-menu`).
	 *
	 * When NOT set (the legacy default), the wrapper keeps `opts.id` and
	 * the menu keeps `${opts.id}-menu` — every existing caller is
	 * byte-identical to before.
	 */
	readonly idPrefix?: string;
	/**
	 * Class prefix used for the wrapper / trigger / menu / item / label /
	 * icon / caret. Defaults to `'mv-dropdown'` so the default
	 * `mv-dropdown__*` BEM shape is preserved. The docs site passes
	 * `classPrefix: 'nav__more'` so the emitted classes match its existing
	 * `_nav.scss` (`.nav__more__trigger`, `.nav__more__menu`, …).
	 *
	 * NOTE: when a host overrides the class prefix it MUST also ship the
	 * matching CSS — `@mcp-vertex/shared/styles` ships the default
	 * `mv-dropdown__*` styles but nothing else.
	 */
	readonly classPrefix?: string;
}

const iconHtml = (icon: string | undefined, classPrefix: string): string =>
	icon
		? `<span class="${classPrefix}__icon" aria-hidden="true">${escapeHtml(icon)}</span>`
		: '';

/**
 * `renderDropdown` — returns the HTML string for a dropdown.
 * The trigger is a `<button class="<classPrefix>__trigger">`; the menu
 * is a `<ul class="<classPrefix>__menu">` hidden by default and shown
 * when the trigger has `aria-expanded="true"` (the runtime sets this
 * on click and resets it on outside-click / Esc).
 *
 * When called with no options beyond `id`/`label`/`items`/`align`, the
 * emitted HTML is byte-identical to the legacy shape (default
 * `idPrefix: 'mv'`, default `classPrefix: 'mv-dropdown'`), so every
 * existing caller keeps working without changes.
 */
export const renderDropdown = (opts: IDropdownOptions): string => {
	const align = opts.align ?? 'left';
	const classPrefix = opts.classPrefix ?? 'mv-dropdown';
	// Ids: when an explicit `idPrefix` is given, the wrapper / trigger /
	// menu ids are built from it. Otherwise we preserve the legacy shape
	// (`opts.id` for the wrapper, `${opts.id}-menu` for the menu) so
	// every existing caller is byte-identical.
	const baseId = opts.idPrefix ?? opts.id;
	const triggerId = `${baseId}-trigger`;
	const menuId = `${baseId}-menu`;
	const trigger = `<button
		type="button"
		id="${escapeHtml(triggerId)}"
		class="${classPrefix}__trigger"
		aria-haspopup="true"
		aria-expanded="false"
		aria-controls="${escapeHtml(menuId)}"
		data-mv-toggle="dropdown"
		data-mv-dropdown-id="${escapeHtml(baseId)}"
	>
		${escapeHtml(opts.label)}
		<span class="${classPrefix}__caret" aria-hidden="true">▾</span>
	</button>`;
	const items = opts.items
		.map(
			(item) =>
				`<li role="none">
				<button
					type="button"
					role="menuitem"
					class="${classPrefix}__item"
					data-mv-action="${escapeHtml(item.id)}"
					data-mv-dropdown-id="${escapeHtml(baseId)}"
				>
					${iconHtml(item.icon, classPrefix)}
					<span class="${classPrefix}__label">${escapeHtml(item.label)}</span>
				</button>
			</li>`,
		)
		.join('');
	const menu = `<ul
		id="${escapeHtml(menuId)}"
		class="${classPrefix}__menu ${classPrefix}__menu--${align}"
		role="menu"
		aria-labelledby="${escapeHtml(menuId)}"
		hidden
	>${items}</ul>`;
	return `<div
		id="${escapeHtml(baseId)}"
		class="${classPrefix}"
		data-mv-dropdown="${escapeHtml(baseId)}"
	>${trigger}${menu}</div>`;
};
