/**
 * `styles.css` — the CSS string shipped with every webview that uses
 * the shared component runtime. The host injects this into the
 * webview's `<style>` block BEFORE the host's overrides (so the host
 * can win on equal specificity for `--vscode-*` fallbacks).
 *
 * All rules use the `--mv-*` tokens defined in
 * `@mcp-vertex/shared/styles` so the brand and spacing are
 * consistent across webview and site.
 */
export const componentCss: string = `
/* ─── Header bar ─────────────────────────────────────────────────── */
.mv-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: var(--mv-s-4) var(--mv-s-5);
	background: var(--mv-bg-soft, #11161d);
	border-bottom: 1px solid var(--mv-line, #2a3038);
}
.mv-header__brand { display: flex; flex-direction: column; gap: 2px; }
.mv-header__name { font-weight: 700; font-size: 14px; letter-spacing: 0.02em; }
.mv-header__version { font-size: 11px; color: var(--mv-fg-muted, #9aa4b2); }
.mv-header__strip { margin-left: auto; display: flex; gap: 8px; align-items: center; }

/* ─── Dropdown ──────────────────────────────────────────────────── */
.mv-dropdown { position: relative; display: inline-block; }
.mv-dropdown__trigger {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 6px 10px;
	background: var(--mv-bg-soft, #11161d);
	color: var(--mv-fg, #e6edf3);
	border: 1px solid var(--mv-line, #2a3038);
	border-radius: var(--mv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.mv-dropdown__trigger:hover { background: var(--mv-bg, #0d1117); }
.mv-dropdown__caret { transition: transform var(--mv-transition-fast, 120ms ease-out); }
.mv-dropdown__trigger[aria-expanded="true"] .mv-dropdown__caret { transform: rotate(180deg); }
.mv-dropdown__menu {
	position: absolute; top: calc(100% + 4px);
	min-width: 200px; padding: 4px; margin: 0; list-style: none;
	background: var(--mv-bg, #0d1117);
	border: 1px solid var(--mv-line, #2a3038);
	border-radius: var(--mv-radius, 8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 100;
	transform: translateY(-4px); opacity: 0;
	transition: transform var(--mv-transition-base, 180ms ease-out), opacity var(--mv-transition-base, 180ms ease-out);
}
.mv-dropdown__menu--right { right: 0; }
.mv-dropdown__menu--left { left: 0; }
.mv-dropdown__trigger[aria-expanded="true"] + .mv-dropdown__menu {
	transform: translateY(0); opacity: 1;
}
.mv-dropdown__menu[hidden] { display: none; }
.mv-dropdown__item {
	display: flex; align-items: center; gap: 8px; width: 100%;
	padding: 8px 10px;
	background: transparent; color: var(--mv-fg, #e6edf3);
	border: 0; border-radius: var(--mv-radius-sm, 4px);
	font: inherit; text-align: left; cursor: pointer;
}
.mv-dropdown__item:hover { background: var(--mv-bg-soft, #11161d); }
.mv-dropdown__icon { width: 16px; text-align: center; }

/* ─── Disclosure ────────────────────────────────────────────────── */
.mv-disclosure { margin: 0; }
.mv-disclosure__summary {
	display: flex; align-items: center; gap: 8px;
	padding: 8px 10px; cursor: pointer;
	list-style: none; user-select: none;
}
.mv-disclosure__summary::-webkit-details-marker { display: none; }
.mv-disclosure__chevron {
	transition: transform var(--mv-transition-fast, 120ms ease-out);
	display: inline-block;
}
.mv-disclosure[open] > .mv-disclosure__summary .mv-disclosure__chevron {
	transform: rotate(90deg);
}
.mv-disclosure__body { padding: 8px 10px 16px; }

/* ─── Language picker ───────────────────────────────────────────── */
.mv-lang-picker { display: inline-flex; align-items: center; gap: 4px; }
.mv-lang-picker__label { font-size: 14px; }
.mv-lang-picker__select {
	padding: 4px 8px;
	background: var(--mv-bg-soft, #11161d);
	color: var(--mv-fg, #e6edf3);
	border: 1px solid var(--mv-line, #2a3038);
	border-radius: var(--mv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}

/* ─── Toast ─────────────────────────────────────────────────────── */
.mv-toast {
	position: fixed; bottom: 16px; right: 16px;
	display: flex; align-items: center; gap: 12px;
	padding: 10px 14px;
	border-radius: var(--mv-radius, 8px);
	color: var(--mv-fg, #e6edf3);
	background: var(--mv-bg-soft, #11161d);
	border: 1px solid var(--mv-line, #2a3038);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 1000;
	max-width: 360px;
	animation: mv-toast-in 180ms ease-out;
}
.mv-toast--success { border-color: var(--mv-brand-blue); }
.mv-toast--warn { border-color: #d29922; }
.mv-toast--error { border-color: #f85149; }
.mv-toast__message { flex: 1; }
.mv-toast__action {
	padding: 4px 10px;
	background: var(--mv-brand-blue);
	color: #fff; border: 0; border-radius: var(--mv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.mv-toast__close {
	display: inline-flex; align-items: center; justify-content: center;
	width: 22px; height: 22px;
	padding: 0; margin-left: 2px;
	background: transparent;
	color: var(--mv-fg-muted, #9aa4b2);
	border: 0; border-radius: var(--mv-radius-sm, 4px);
	font: inherit; font-size: 18px; line-height: 1; cursor: pointer;
}
.mv-toast__close:hover { color: var(--mv-fg, #e6edf3); background: var(--mv-bg, #0d1117); }
@keyframes mv-toast-in {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}

/* ─── prefers-reduced-motion ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.mv-dropdown__menu,
	.mv-dropdown__caret,
	.mv-disclosure__chevron,
	.mv-toast { transition: none; animation: none; }
}
`.trim();
