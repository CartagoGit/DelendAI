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
}

const kindClass = (kind: ToastKind): string => `mv-toast--${kind}`;

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
	const ttlAttr = ttl > 0 ? ` data-mv-toast-ttl="${ttl}"` : '';
	const stickyAttr = sticky ? ' data-mv-toast-sticky="true"' : '';
	const action = opts.action
		? `<button type="button" class="mv-toast__action" data-mv-action="${escapeHtml(opts.action.id)}" data-mv-toast-id="${escapeHtml(opts.id)}">${escapeHtml(opts.action.label)}</button>`
		: '';
	const close = sticky
		? `<button type="button" class="mv-toast__close" aria-label="Close" data-mv-toast-close="${escapeHtml(opts.id)}">×</button>`
		: '';
	return `<div
	id="${escapeHtml(opts.id)}"
	class="mv-toast ${kindClass(kind)}"
	role="status"
	aria-live="polite"${ttlAttr}${stickyAttr}
	data-mv-toast="${escapeHtml(opts.id)}"
>
	<span class="mv-toast__message">${escapeHtml(opts.message)}</span>
	${action}
	${close}
</div>`;
};
