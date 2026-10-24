/**
 * `Toast` — webview-agnostic toast notification. Renders as a fixed
 * element; the host injects it into the webview and the runtime
 * removes it after `ttl` ms (default 4000). Honors
 * `prefers-reduced-motion: reduce` (no slide-in animation).
 */
import { escapeHtml } from '../dashboard/format';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface IToastOptions {
	readonly id: string;
	readonly kind?: ToastKind;
	readonly message: string;
	readonly ttl?: number; // ms; 0 = sticky
	readonly action?: { id: string; label: string };
	/**
	 * x00103 + a00083 F22: accessible name for the sticky toast's close
	 * button. Required when `ttl <= 0` (sticky toast); the caller MUST
	 * source it from the active i18n dictionary
	 * (`extensionText(dict, 'a11yCloseToast')`). A fallback English
	 * string used to ship silently from the shared package; that
	 * violated AGENTS.md rule 9 in every non-English host. Optional
	 * for non-sticky toasts (no close button rendered).
	 */
	readonly closeLabel?: string;
}

const kindClass = (kind: ToastKind): string => `delendai-toast--${kind}`;

/**
 * `renderToast` — returns the HTML string for a toast. The host
 * injects it into the webview (typically at the end of the body).
 * The runtime auto-removes the element after `ttl` ms (or never
 * if `ttl === 0`).
 */
export const renderToast = (opts: IToastOptions): string => {
	const kind = opts.kind ?? 'info';
	const ttl = opts.ttl ?? 4000;
	// `ttl === 0` is the sticky contract: the toast never auto-removes,
	// so it MUST give the user a way out (close button + Esc), otherwise
	// it is a permanent obstruction (H25).
	const sticky = ttl <= 0;
	const ttlAttr = ttl > 0 ? ` data-delendai-toast-ttl="${ttl}"` : '';
	const stickyAttr = sticky ? ' data-delendai-toast-sticky="true"' : '';
	const action = opts.action
		? `<button type="button" class="delendai-toast__action" data-delendai-action="${escapeHtml(opts.action.id)}" data-delendai-toast-id="${escapeHtml(opts.id)}">${escapeHtml(opts.action.label)}</button>`
		: '';
	// a00083 F22: sticky toasts REQUIRE a `closeLabel` (i18n-sourced).
	// Throw early instead of silently shipping English a11y text.
	const closeLabel =
		opts.closeLabel ??
		(sticky
			? (() => {
					throw new Error(
						`renderToast: sticky toast "${opts.id}" must receive an i18n-sourced closeLabel (a00083 F22).`,
					);
				})()
			: '');
	const close = sticky
		? `<button type="button" class="delendai-toast__close" aria-label="${escapeHtml(closeLabel)}" data-delendai-toast-close="${escapeHtml(opts.id)}">×</button>`
		: '';
	return `<div
	id="${escapeHtml(opts.id)}"
	class="delendai-toast ${kindClass(kind)}"
	role="status"
	aria-live="polite"${ttlAttr}${stickyAttr}
	data-delendai-toast="${escapeHtml(opts.id)}"
>
	<span class="delendai-toast__message">${escapeHtml(opts.message)}</span>
	${action}
	${close}
</div>`;
};
