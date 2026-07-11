/**
 * `Disclosure` — pure `<details>`/`<summary>` disclosure. Works
 * without JavaScript (the native element toggles `open` itself);
 * the runtime adds `data-mcpv-toggle="disclosure"` for hosts that want
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
	return `<details class="mcpv-disclosure"${idAttr}${open} data-mcpv-toggle="disclosure">
	<summary class="mcpv-disclosure__summary">
		<span class="mcpv-disclosure__chevron" aria-hidden="true">▸</span>
		<span class="mcpv-disclosure__label">${escapeHtml(opts.summary)}</span>
	</summary>
	<div class="mcpv-disclosure__body" data-mcpv-disclosure-body>
		<!-- body injected by the host via element.querySelector(...).innerHTML = ... -->
	</div>
</details>`;
};
