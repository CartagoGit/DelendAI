/**
 * `Disclosure` — pure `<details>`/`<summary>` disclosure. Works
 * without JavaScript (the native element toggles `open` itself);
 * the runtime adds `data-mv-toggle="disclosure"` for hosts that want
 * to be notified of state changes.
 *
 * Renders an MV chevron icon on the right of the summary.
 */
import { escapeHtml } from '../dashboard/format';

export interface IDisclosureOptions {
	readonly summary: string;
	readonly defaultOpen?: boolean;
	readonly id?: string;
}

/**
 * `renderDisclosure` — returns the HTML string for a collapsible
 * section. The body is provided by the caller (the disclosure is a
 * generic wrapper, not a layout primitive).
 */
export const renderDisclosure = (opts: IDisclosureOptions): string => {
	const open = opts.defaultOpen ? ' open' : '';
	const idAttr = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
	return `<details class="mv-disclosure"${idAttr}${open} data-mv-toggle="disclosure">
	<summary class="mv-disclosure__summary">
		<span class="mv-disclosure__chevron" aria-hidden="true">▸</span>
		<span class="mv-disclosure__label">${escapeHtml(opts.summary)}</span>
	</summary>
	<div class="mv-disclosure__body" data-mv-disclosure-body>
		<!-- body injected by the host via element.querySelector(...).innerHTML = ... -->
	</div>
</details>`;
};
