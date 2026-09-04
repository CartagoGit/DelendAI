/**
 * `styles.css` — the CSS string shipped with every webview that uses
 * the shared component runtime. The host injects this into the
 * webview's `<style>` block BEFORE the host's overrides (so the host
 * can win on equal specificity for `--vscode-*` fallbacks).
 *
 * All rules use the `--mcpv-*` tokens defined in
 * `@delendai/shared/styles` so the brand and spacing are
 * consistent across webview and site.
 */
export const componentCss: string = `
/* ─── Header bar ─────────────────────────────────────────────────── */
.mcpv-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: var(--mcpv-s-4) var(--mcpv-s-5);
	background: var(--mcpv-bg-soft, #11161d);
	border-bottom: 1px solid var(--mcpv-line, #2a3038);
}
.mcpv-header__brand { display: flex; flex-direction: column; gap: 2px; }
.mcpv-header__name { font-weight: 700; font-size: 14px; letter-spacing: 0.02em; }
.mcpv-header__version { font-size: 11px; color: var(--mcpv-fg-muted, #9aa4b2); }
.mcpv-header__strip { margin-left: auto; display: flex; gap: 8px; align-items: center; }

/* ─── Dropdown ──────────────────────────────────────────────────── */
.mcpv-dropdown { position: relative; display: inline-block; }
.mcpv-dropdown__trigger {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 6px 10px;
	background: var(--mcpv-bg-soft, #11161d);
	color: var(--mcpv-fg, #e6edf3);
	border: 1px solid var(--mcpv-line, #2a3038);
	border-radius: var(--mcpv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.mcpv-dropdown__trigger:hover { background: var(--mcpv-bg, #0d1117); }
.mcpv-dropdown__caret { transition: transform var(--mcpv-transition-fast, 120ms ease-out); }
.mcpv-dropdown__trigger[aria-expanded="true"] .mcpv-dropdown__caret { transform: rotate(180deg); }
.mcpv-dropdown__menu {
	position: absolute; top: calc(100% + 4px);
	min-width: 200px; padding: 4px; margin: 0; list-style: none;
	background: var(--mcpv-bg, #0d1117);
	border: 1px solid var(--mcpv-line, #2a3038);
	border-radius: var(--mcpv-radius, 8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 100;
	transform: translateY(-4px); opacity: 0;
	transition: transform var(--mcpv-transition-base, 180ms ease-out), opacity var(--mcpv-transition-base, 180ms ease-out);
}
.mcpv-dropdown__menu--right { right: 0; }
.mcpv-dropdown__menu--left { left: 0; }
.mcpv-dropdown__trigger[aria-expanded="true"] + .mcpv-dropdown__menu {
	transform: translateY(0); opacity: 1;
}
.mcpv-dropdown__menu[hidden] { display: none; }
.mcpv-dropdown__item {
	display: flex; align-items: center; gap: 8px; width: 100%;
	padding: 8px 10px;
	background: transparent; color: var(--mcpv-fg, #e6edf3);
	border: 0; border-radius: var(--mcpv-radius-sm, 4px);
	font: inherit; text-align: left; cursor: pointer;
}
.mcpv-dropdown__item:hover { background: var(--mcpv-bg-soft, #11161d); }
.mcpv-dropdown__icon { width: 16px; text-align: center; }

/* ─── Disclosure ────────────────────────────────────────────────── */
.mcpv-disclosure { margin: 0; }
.mcpv-disclosure__summary {
	display: flex; align-items: center; gap: 8px;
	padding: 8px 10px; cursor: pointer;
	list-style: none; user-select: none;
}
.mcpv-disclosure__summary::-webkit-details-marker { display: none; }
.mcpv-disclosure__chevron {
	transition: transform var(--mcpv-transition-fast, 120ms ease-out);
	display: inline-block;
}
.mcpv-disclosure[open] > .mcpv-disclosure__summary .mcpv-disclosure__chevron {
	transform: rotate(90deg);
}
.mcpv-disclosure__body { padding: 8px 10px 16px; }

/* ─── Language picker ───────────────────────────────────────────── */
.mcpv-lang-picker { display: inline-flex; align-items: center; gap: 4px; }
.mcpv-lang-picker__label { font-size: 14px; }
.mcpv-lang-picker__select {
	padding: 4px 8px;
	background: var(--mcpv-bg-soft, #11161d);
	color: var(--mcpv-fg, #e6edf3);
	border: 1px solid var(--mcpv-line, #2a3038);
	border-radius: var(--mcpv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}

/* ─── Toast ─────────────────────────────────────────────────────── */
.mcpv-toast {
	position: fixed; bottom: 16px; right: 16px;
	display: flex; align-items: center; gap: 12px;
	padding: 10px 14px;
	border-radius: var(--mcpv-radius, 8px);
	color: var(--mcpv-fg, #e6edf3);
	background: var(--mcpv-bg-soft, #11161d);
	border: 1px solid var(--mcpv-line, #2a3038);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 1000;
	max-width: 360px;
	animation: mcpv-toast-in 180ms ease-out;
}
.mcpv-toast--success { border-color: var(--mcpv-brand-blue); }
.mcpv-toast--warn { border-color: #d29922; }
.mcpv-toast--error { border-color: #f85149; }
.mcpv-toast__message { flex: 1; }
.mcpv-toast__action {
	padding: 4px 10px;
	background: var(--mcpv-brand-blue);
	color: #fff; border: 0; border-radius: var(--mcpv-radius-sm, 4px);
	font: inherit; cursor: pointer;
}
.mcpv-toast__close {
	display: inline-flex; align-items: center; justify-content: center;
	width: 22px; height: 22px;
	padding: 0; margin-left: 2px;
	background: transparent;
	color: var(--mcpv-fg-muted, #9aa4b2);
	border: 0; border-radius: var(--mcpv-radius-sm, 4px);
	font: inherit; font-size: 18px; line-height: 1; cursor: pointer;
}
.mcpv-toast__close:hover { color: var(--mcpv-fg, #e6edf3); background: var(--mcpv-bg, #0d1117); }
@keyframes mcpv-toast-in {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}

/* ─── prefers-reduced-motion ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.mcpv-dropdown__menu,
	.mcpv-dropdown__caret,
	.mcpv-disclosure__chevron,
	.mcpv-toast { transition: none; animation: none; }
}
`.trim();
