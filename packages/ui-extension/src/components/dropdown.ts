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
}

const iconHtml = (icon?: string): string =>
	icon
		? `<span class="mv-dropdown__icon" aria-hidden="true">${escapeHtml(icon)}</span>`
		: '';

/**
 * `renderDropdown` — returns the HTML string for a dropdown.
 * The trigger is a `<button class="mv-dropdown__trigger">`; the menu
 * is a `<ul class="mv-dropdown__menu">` hidden by default and shown
 * when the trigger has `aria-expanded="true"` (the runtime sets this
 * on click and resets it on outside-click / Esc).
 */
export const renderDropdown = (opts: IDropdownOptions): string => {
	const align = opts.align ?? 'left';
	const trigger = `<button
		type="button"
		class="mv-dropdown__trigger"
		aria-haspopup="true"
		aria-expanded="false"
		aria-controls="${escapeHtml(opts.id)}-menu"
		data-mv-toggle="dropdown"
		data-mv-dropdown-id="${escapeHtml(opts.id)}"
	>
		${escapeHtml(opts.label)}
		<span class="mv-dropdown__caret" aria-hidden="true">▾</span>
	</button>`;
	const items = opts.items
		.map(
			(item) =>
				`<li role="none">
				<button
					type="button"
					role="menuitem"
					class="mv-dropdown__item"
					data-mv-action="${escapeHtml(item.id)}"
					data-mv-dropdown-id="${escapeHtml(opts.id)}"
				>
					${iconHtml(item.icon)}
					<span class="mv-dropdown__label">${escapeHtml(item.label)}</span>
				</button>
			</li>`,
		)
		.join('');
	const menu = `<ul
		id="${escapeHtml(opts.id)}-menu"
		class="mv-dropdown__menu mv-dropdown__menu--${align}"
		role="menu"
		aria-labelledby="${escapeHtml(opts.id)}-menu"
		hidden
	>${items}</ul>`;
	return `<div
		id="${escapeHtml(opts.id)}"
		class="mv-dropdown"
		data-mv-dropdown="${escapeHtml(opts.id)}"
	>${trigger}${menu}</div>`;
};
