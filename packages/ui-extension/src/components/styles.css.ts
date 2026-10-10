/**
 * `styles.css` — the CSS string shipped with every webview that uses
 * the shared component runtime. The host injects this into the
 * webview's `<style>` block BEFORE the host's overrides (so the host
 * can win on equal specificity for `--vscode-*` fallbacks).
 *
 * All rules use the `--delendai-*` tokens defined in
 * `@delendai/shared/styles` so the brand and spacing are
 * consistent across webview and site.
 */
export const componentCss: string = `
/* ─── Header bar ─────────────────────────────────────────────────── */
.delendai-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: var(--delendai-s-4) var(--delendai-s-5);
	background: var(--delendai-bg-soft, #11161d);
	border-bottom: 1px solid var(--delendai-line, #2a3038);
}
.delendai-header__brand { display: flex; flex-direction: column; gap: 2px; }
.delendai-header__name { font-weight: 700; font-size: 14px; letter-spacing: 0.02em; }
.delendai-header__version { font-size: 11px; color: var(--delendai-fg-muted, #9aa4b2); }
.delendai-header__strip { margin-left: auto; display: flex; gap: 8px; align-items: center; }

/* ─── Dropdown ──────────────────────────────────────────────────── */
.delendai-dropdown { position: relative; display: inline-block; }
.delendai-dropdown__trigger {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 6px 10px;
	background: var(--delendai-bg-soft, #11161d);
	color: var(--delendai-fg, #e6edf3);
	border: 1px solid var(--delendai-line, #2a3038);
	border-radius: var(--delendai-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.delendai-dropdown__trigger:hover { background: var(--delendai-bg, #0d1117); }
.delendai-dropdown__caret { transition: transform var(--delendai-transition-fast, 120ms ease-out); }
.delendai-dropdown__trigger[aria-expanded="true"] .delendai-dropdown__caret { transform: rotate(180deg); }
.delendai-dropdown__menu {
	position: absolute; top: calc(100% + 4px);
	min-width: 200px; padding: 4px; margin: 0; list-style: none;
	background: var(--delendai-bg, #0d1117);
	border: 1px solid var(--delendai-line, #2a3038);
	border-radius: var(--delendai-radius, 8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 100;
	transform: translateY(-4px); opacity: 0;
	transition: transform var(--delendai-transition-base, 180ms ease-out), opacity var(--delendai-transition-base, 180ms ease-out);
}
.delendai-dropdown__menu--right { right: 0; }
.delendai-dropdown__menu--left { left: 0; }
.delendai-dropdown__trigger[aria-expanded="true"] + .delendai-dropdown__menu {
	transform: translateY(0); opacity: 1;
}
.delendai-dropdown__menu[hidden] { display: none; }
.delendai-dropdown__item {
	display: flex; align-items: center; gap: 8px; width: 100%;
	padding: 8px 10px;
	background: transparent; color: var(--delendai-fg, #e6edf3);
	border: 0; border-radius: var(--delendai-radius-sm, 4px);
	font: inherit; text-align: left; cursor: pointer;
}
.delendai-dropdown__item:hover { background: var(--delendai-bg-soft, #11161d); }
.delendai-dropdown__icon { width: 16px; text-align: center; }

/* ─── Disclosure ────────────────────────────────────────────────── */
.delendai-disclosure { margin: 0; }
.delendai-disclosure__summary {
	display: flex; align-items: center; gap: 8px;
	padding: 8px 10px; cursor: pointer;
	list-style: none; user-select: none;
}
.delendai-disclosure__summary::-webkit-details-marker { display: none; }
.delendai-disclosure__chevron {
	transition: transform var(--delendai-transition-fast, 120ms ease-out);
	display: inline-block;
}
.delendai-disclosure[open] > .delendai-disclosure__summary .delendai-disclosure__chevron {
	transform: rotate(90deg);
}
.delendai-disclosure__body { padding: 8px 10px 16px; }

/* ─── Language picker ───────────────────────────────────────────── */
.delendai-lang-picker { display: inline-flex; align-items: center; gap: 4px; }
.delendai-lang-picker__label { font-size: 14px; }
.delendai-lang-picker__select {
	padding: 4px 8px;
	background: var(--delendai-bg-soft, #11161d);
	color: var(--delendai-fg, #e6edf3);
	border: 1px solid var(--delendai-line, #2a3038);
	border-radius: var(--delendai-radius-sm, 4px);
	font: inherit; cursor: pointer;
}

/* ─── Toast ─────────────────────────────────────────────────────── */
.delendai-toast {
	position: fixed; bottom: 16px; right: 16px;
	display: flex; align-items: center; gap: 12px;
	padding: 10px 14px;
	border-radius: var(--delendai-radius, 8px);
	color: var(--delendai-fg, #e6edf3);
	background: var(--delendai-bg-soft, #11161d);
	border: 1px solid var(--delendai-line, #2a3038);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 1000;
	max-width: 360px;
	animation: delendai-toast-in 180ms ease-out;
}
.delendai-toast--success { border-color: var(--delendai-brand-blue); }
.delendai-toast--warn { border-color: #d29922; }
.delendai-toast--error { border-color: #f85149; }
.delendai-toast__message { flex: 1; }
.delendai-toast__action {
	padding: 4px 10px;
	background: var(--delendai-brand-blue);
	color: #fff; border: 0; border-radius: var(--delendai-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.delendai-toast__close {
	display: inline-flex; align-items: center; justify-content: center;
	width: 22px; height: 22px;
	padding: 0; margin-left: 2px;
	background: transparent;
	color: var(--delendai-fg-muted, #9aa4b2);
	border: 0; border-radius: var(--delendai-radius-sm, 4px);
	font: inherit; font-size: 18px; line-height: 1; cursor: pointer;
}
.delendai-toast__close:hover { color: var(--delendai-fg, #e6edf3); background: var(--delendai-bg, #0d1117); }
@keyframes delendai-toast-in {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}

/* ─── prefers-reduced-motion ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.delendai-dropdown__menu,
	.delendai-dropdown__caret,
	.delendai-disclosure__chevron,
	.delendai-toast { transition: none; animation: none; }
}
`.trim();
