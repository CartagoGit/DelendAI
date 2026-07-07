/**
 * `apps/shared/src/styles/dashboard/dashboard-css.ts` — the dashboard CSS
 * as a TypeScript template literal. Inlined by `renderDashboard` into the
 * webview <style> block alongside `componentCss`.
 *
 * Why a `.ts` string instead of a raw `.css` import?
 *
 * The webview contract is: HTML arrives as a single string from
 * `renderDashboard(...)`; the host (VS Code extension host, JetBrains
 * plugin, Astro page) injects the string into a webview /`set:html` and
 * the dashboard renders with whatever CSS we shipped. The CSP is
 * `default-deny` with `style-src 'self' 'unsafe-inline'`, so a
 * `<link rel="stylesheet">` to a co-located asset would require the
 * host to expose the file via `asWebviewUri`; bundling it as a string
 * keeps the contract single-string and zero-runtime-fetch.
 *
 * What this CSS covers
 * --------------------
 * Restored after `ee1f58d5` (f00047 S4) deleted it: the dashboard
 * panel/card/kpi/tabs/header rules. `componentCss` (shared
 * components) covers `.mv-header`, `.mv-dropdown`, `.mv-toast`,
 * `.mv-disclosure`, `.mv-lang-picker` etc.; this module fills the
 * dashboard-specific gap (panels, cards, tabs, KPIs, sessions rows,
 * usage bars, time histogram).
 *
 * Design constraints (slice 'fix styles: native + responsive')
 *   - **VS Code native**: every colour/font/border falls back to a
 *     `--vscode-*` theme variable so the dashboard inherits the
 *     editor's current theme (light, dark+, high-contrast, custom).
 *     Brand colours stay consistent (blue→purple gradient) by living
 *     in `--mv-brand-*`; everything else delegates to the host.
 *   - **Responsive, mobile-first**: single column under 640px (the
 *     minimum sensible width for a tab bar); widens to 2-col cards
 *     at 640px, 3-col at 1024px, full grid at 1280px. Tabs scroll
 *     horizontally instead of wrapping. Tables get an internal
 *     scroll wrapper instead of overflowing.
 *   - **No heavy shadows / rounded pills**: VS Code panels use 1px
 *     solid borders + flat surfaces. Shadows would fight the host
 *     chrome.
 *   - **Focus-visible**: every interactive control gets an
 *     `--vscode-focusBorder` outline on keyboard focus, matching the
 *     rest of the IDE.
 */

export const dashboardCss: string = `
/* ─── Theme tokens ──────────────────────────────────────────────── */
:root {
	--mv-brand-blue: #58a6ff;
	--mv-brand-purple: #a371f7;
	--mv-brand-gradient: linear-gradient(
		135deg,
		var(--mv-brand-blue),
		var(--mv-brand-purple)
	);

	/* Surfaces: defer to VS Code's theme, fall back to GitHub-dark
	 * values so the dashboard is still legible in plain HTML
	 * (the dev entry) and JetBrains hosts that don't expose
	 * the VS Code theme variables. The TS template literal
	 * below starts a CSS custom property (which begins with
	 * two hyphens) — keep that token separate from any text
	 * the TS lexer could mistake for an expression. */
	/*
	 * Each MV color token reads from an MV-host indirection. That
	 * indirection defaults to the host VS Code token when running
	 * inside a real webview, and to a GitHub-dark fallback otherwise.
	 * The data-theme selectors below OVERRIDE the MV-host indirection
	 * — so a user's explicit theme choice always wins, even when the
	 * host exposes VS Code tokens that would otherwise take
	 * precedence (the user's intent beats the host's theme).
	 */
	--mv-bg-host: var(--vscode-editor-background, #1e1e1e);
	--mv-bg-soft-host: var(--vscode-sideBar-background, #252526);
	--mv-bg-card-host: var(--vscode-editorWidget-background, #252526);
	--mv-fg-host: var(--vscode-foreground, #d4d4d4);
	--mv-fg-muted-host: var(--vscode-descriptionForeground, #858585);
	--mv-border-host: var(--vscode-widget-border, #3c3c3c);
	--mv-border-strong-host: var(
		--vscode-editorWidget-border,
		var(--vscode-widget-border, #3c3c3c)
	);
	--mv-link-host: var(--vscode-textLink-foreground, var(--mv-brand-blue));
	--mv-link-active-host: var(--vscode-textLink-activeForeground, #ff8c69);
	--mv-focus-host: var(--vscode-focusBorder, #007fd4);
	--mv-error-host: var(--vscode-errorForeground, #f48771);
	--mv-warn-host: var(--vscode-editorWarning-foreground, #cca700);
	--mv-ok-host: var(--vscode-terminal-ansiGreen, #89d185);

	--mv-bg: var(--mv-bg-host);
	--mv-bg-soft: var(--mv-bg-soft-host);
	--mv-bg-card: var(--mv-bg-card-host);
	--mv-fg: var(--mv-fg-host);
	--mv-fg-muted: var(--mv-fg-muted-host);
	--mv-border: var(--mv-border-host);
	--mv-border-strong: var(--mv-border-strong-host);
	--mv-link: var(--mv-link-host);
	--mv-link-active: var(--mv-link-active-host);
	--mv-focus: var(--mv-focus-host);
	--mv-error: var(--mv-error-host);
	--mv-warn: var(--mv-warn-host);
	--mv-ok: var(--mv-ok-host);

	/* Geometry — tight, native. Real VS Code panels use 12–16px padding
	 * and 4px gaps; the dashboard mirrors that. */
	--mv-radius: 4px;
	--mv-radius-lg: 6px;
	--mv-gap-xs: 4px;
	--mv-gap-sm: 8px;
	--mv-gap: 12px;
	--mv-gap-lg: 16px;
	--mv-pad: 12px;
	--mv-pad-lg: 16px;

	--mv-font-prose: var(--vscode-font-family, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
	--mv-font-mono: var(
		--vscode-editor-font-family,
		ui-monospace,
		SFMono-Regular,
		Menlo,
		Consolas,
		monospace
	);
	--mv-font-size: 13px;
	--mv-font-size-sm: 12px;
	--mv-font-size-xs: 11px;
	--mv-fw-mono-num: 500;
}

* { box-sizing: border-box; }

html,
body {
	margin: 0;
	padding: 0;
	background: var(--mv-bg);
	color: var(--mv-fg);
	font-family: var(--mv-font-prose);
	font-size: var(--mv-font-size);
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
	text-rendering: optimizeLegibility;
}

a {
	color: var(--mv-link);
	text-decoration: none;
}
a:hover { text-decoration: underline; }
a:focus-visible { outline: 1px solid var(--mv-focus); outline-offset: 1px; }

code, pre, .mv-num, kbd, samp {
	font-family: var(--mv-font-mono);
	font-variant-numeric: tabular-nums;
}

button, [role='tab'], select {
	font: inherit;
	color: inherit;
	background: transparent;
	border: 0;
	cursor: pointer;
}
button:focus-visible,
[role='tab']:focus-visible,
select:focus-visible {
	outline: 1px solid var(--mv-focus);
	outline-offset: -1px;
}

/* ─── Layout primitives ─────────────────────────────────────────── */

.mv-main {
	padding: var(--mv-gap) var(--mv-pad-lg);
}

/* ─── Header / brand ────────────────────────────────────────────── */

.mv-header {
	display: flex;
	align-items: center;
	gap: var(--mv-gap);
	padding: var(--mv-pad) var(--mv-pad-lg);
	background: var(--mv-bg-soft);
	border-bottom: 1px solid var(--mv-border);
	min-height: 44px;
}
.mv-header__logo {
	width: 28px;
	height: 28px;
	flex: 0 0 auto;
}
.mv-header__brand {
	display: flex;
	flex-direction: column;
	gap: 1px;
	min-width: 0;
}
.mv-header__name {
	font-weight: 600;
	font-size: 13px;
	letter-spacing: 0.01em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.mv-header__version {
	font-size: var(--mv-font-size-xs);
	color: var(--mv-fg-muted);
}
.mv-header__strip {
	margin-left: auto;
	display: flex;
	gap: var(--mv-gap-sm);
	align-items: center;
	flex: 0 0 auto;
}

/* ─── Tabs (horizontal, scroll on overflow) ─────────────────────── */

.mv-tabs {
	display: flex;
	align-items: stretch;
	gap: 0;
	background: var(--mv-bg-soft);
	border-bottom: 1px solid var(--mv-border);
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: thin;
	scroll-behavior: smooth;
	-webkit-overflow-scrolling: touch;
}
.mv-tabs::-webkit-scrollbar { height: 4px; }
.mv-tabs::-webkit-scrollbar-thumb {
	background: var(--mv-border);
	border-radius: 2px;
}
.mv-tab {
	flex: 0 0 auto;
	padding: 8px var(--mv-pad-lg);
	font-size: var(--mv-font-size-sm);
	color: var(--mv-fg-muted);
	border-bottom: 2px solid transparent;
	white-space: nowrap;
	transition: color 60ms ease, border-color 60ms ease;
}
.mv-tab:hover { color: var(--mv-fg); }
.mv-tab[aria-selected='true'] {
	color: var(--mv-fg);
	border-bottom-color: var(--mv-focus);
	font-weight: 500;
}
.mv-tab[data-action='refresh'] {
	margin-left: auto;
	padding: 8px var(--mv-pad);
	font-size: 14px;
	line-height: 1;
}

/* ─── KPI strip ─────────────────────────────────────────────────── */

.mv-kpis {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: var(--mv-gap-sm);
	padding: var(--mv-gap) var(--mv-pad-lg);
	background: var(--mv-bg-soft);
	border-bottom: 1px solid var(--mv-border);
}
.mv-kpi {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 10px 12px 10px 14px;
	background: var(--mv-bg-card);
	border: 1px solid var(--mv-border);
	border-radius: var(--mv-radius);
	min-width: 0;
	overflow: hidden;
}
.mv-kpi::before {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--mv-brand-gradient);
	opacity: 0.85;
}
.mv-kpi__label {
	font-size: var(--mv-font-size-xs);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--mv-fg-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.mv-kpi__value {
	font-family: var(--mv-font-mono);
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	font-size: 17px;
	line-height: 1.2;
	color: var(--mv-fg);
	word-break: break-word;
}
.mv-kpi__hint {
	font-size: var(--mv-font-size-xs);
	color: var(--mv-fg-muted);
	margin-top: 2px;
}

/* ─── Panels (one per tab) ──────────────────────────────────────── */

.mv-panel {
	display: none;
	animation: mv-fade-in 80ms ease-out;
}
.mv-panel[data-active='true'] { display: block; }

@keyframes mv-fade-in {
	from { opacity: 0; transform: translateY(1px); }
	to { opacity: 1; transform: none; }
}

.mv-panel__title {
	display: none;
}
.mv-panel__grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--mv-gap);
	padding: var(--mv-gap) var(--mv-pad-lg);
}

/* ─── Cards ─────────────────────────────────────────────────────── */

.mv-card {
	background: var(--mv-bg-card);
	border: 1px solid var(--mv-border);
	border-radius: var(--mv-radius-lg);
	padding: var(--mv-pad);
	min-width: 0;
	overflow: hidden;
}
.mv-card__title {
	font-size: var(--mv-font-size-xs);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--mv-fg-muted);
	font-weight: 600;
	margin: 0 0 var(--mv-gap-sm);
}

@media (min-width: 640px) {
	.mv-panel__grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--mv-gap);
		padding: var(--mv-gap) var(--mv-pad-lg);
	}
}

@media (min-width: 1024px) {
	.mv-panel__grid {
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--mv-gap-lg);
		padding: var(--mv-gap) var(--mv-pad-lg);
	}
	.mv-card { grid-column: span 6; }
	.mv-card--third { grid-column: span 4; }
	.mv-card--half { grid-column: span 6; }
	.mv-card--full { grid-column: span 12; }
}

/* ─── Tables ────────────────────────────────────────────────────── */

.mv-table-wrap {
	overflow-x: auto;
	margin: 0 calc(var(--mv-pad-lg) * -1);
}
.mv-table {
	width: 100%;
	min-width: 480px;
	border-collapse: collapse;
	font-size: var(--mv-font-size-sm);
}
.mv-table th,
.mv-table td {
	padding: 6px var(--mv-pad);
	border-bottom: 1px solid var(--mv-border);
	text-align: left;
	vertical-align: middle;
	white-space: nowrap;
}
.mv-table th {
	font-weight: 600;
	font-size: var(--mv-font-size-xs);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--mv-fg-muted);
	cursor: pointer;
	user-select: none;
	position: sticky;
	top: 0;
	background: var(--mv-bg-card);
}
.mv-table th:focus-visible { outline-offset: -2px; }
.mv-table td.mv-num,
.mv-table th[data-sort]:not([data-sort='tool']):not([data-sort='plugin']) {
	text-align: right;
	font-variant-numeric: tabular-nums;
	font-family: var(--mv-font-mono);
	font-weight: var(--mv-fw-mono-num);
}
.mv-table tr:hover td {
	background: var(--mv-bg-soft);
}

/* ─── Sparklines & charts ───────────────────────────────────────── */

.mv-spark {
	width: 100%;
	height: 32px;
	display: block;
	color: var(--mv-link);
}
.mv-spark polyline {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linejoin: round;
	stroke-linecap: round;
}
.mv-spark .mv-spark__axis {
	stroke: var(--mv-border);
	stroke-width: 1;
	stroke-dasharray: 2 3;
}

.mv-bar-track {
	flex: 1 1 auto;
	height: 6px;
	background: var(--mv-border);
	border-radius: 3px;
	overflow: hidden;
	min-width: 60px;
}
.mv-bar {
	height: 100%;
	background: var(--mv-brand-gradient);
	border-radius: inherit;
	transition: width 120ms ease;
}
.mv-bar--ok { background: var(--mv-ok); }
.mv-bar--warn { background: var(--mv-warn); }
.mv-bar--err { background: var(--mv-error); }

.mv-row {
	display: flex;
	align-items: center;
	gap: var(--mv-gap-sm);
	padding: 6px 0;
	border-bottom: 1px solid var(--mv-border);
	font-size: var(--mv-font-size-sm);
}
.mv-row:last-child { border-bottom: 0; }
.mv-row__name {
	font-weight: 500;
	font-family: var(--mv-font-mono);
	font-size: var(--mv-font-size-sm);
	min-width: 0;
	flex: 0 0 auto;
	max-width: 40%;
	overflow: hidden;
	text-overflow: ellipsis;
}
.mv-row__bar-wrap {
	flex: 1 1 auto;
	display: flex;
	align-items: center;
	gap: var(--mv-gap-sm);
	min-width: 0;
}
.mv-row__bar-wrap > .mv-bar-track { flex: 1 1 auto; }
.mv-row__pct {
	font-family: var(--mv-font-mono);
	font-size: var(--mv-font-size-xs);
	color: var(--mv-fg-muted);
	min-width: 38px;
	text-align: right;
	font-variant-numeric: tabular-nums;
}

/* ─── Pills (status / proposal track) ──────────────────────────── */

.mv-pill {
	display: inline-flex;
	align-items: center;
	padding: 1px 8px;
	font-size: var(--mv-font-size-xs);
	font-weight: 500;
	border-radius: 10px;
	border: 1px solid var(--mv-border);
	background: var(--mv-bg-soft);
	color: var(--mv-fg-muted);
	text-transform: lowercase;
	letter-spacing: 0.02em;
	white-space: nowrap;
}
.mv-pill[data-tone='ok']   { color: var(--mv-ok); border-color: var(--mv-ok); }
.mv-pill[data-tone='warn'] { color: var(--mv-warn); border-color: var(--mv-warn); }
.mv-pill[data-tone='err']  { color: var(--mv-error); border-color: var(--mv-error); }
.mv-pill[data-tone='accent'] {
	color: var(--mv-brand-purple);
	border-color: var(--mv-brand-purple);
}

/* ─── Sessions / Times ─────────────────────────────────────────── */

.mv-grid-2 {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--mv-gap);
}
@media (min-width: 720px) {
	.mv-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.mv-histogram {
	display: flex;
	align-items: end;
	gap: var(--mv-gap-sm);
	height: 88px;
	padding: var(--mv-gap-sm) 0;
	border-bottom: 1px solid var(--mv-border);
}
.mv-histogram__col {
	display: flex;
	flex-direction: column-reverse;
	flex: 1 1 0;
	min-width: 24px;
	background: var(--mv-brand-gradient);
	border-radius: 2px 2px 0 0;
	transition: opacity 120ms ease;
}
.mv-histogram__col:hover { opacity: 0.75; }

/* ─── Footer / status bar ──────────────────────────────────────── */

.mv-footer {
	display: flex;
	align-items: center;
	gap: var(--mv-gap);
	padding: 6px var(--mv-pad-lg);
	background: var(--mv-bg-soft);
	border-top: 1px solid var(--mv-border);
	font-size: var(--mv-font-size-xs);
	color: var(--mv-fg-muted);
}

/* ─── Utilities ─────────────────────────────────────────────────── */

.mv-mono { font-family: var(--mv-font-mono); font-variant-numeric: tabular-nums; }
.mv-muted { color: var(--mv-fg-muted); }
.mv-truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	white-space: nowrap;
	border: 0;
}

/* ─── Theme overrides ────────────────────────────────────────────── */
/*
 * The dashboard inherits the host's theme via VS Code tokens. When
 * the user picks theme light or dark from the Settings panel we
 * set data-theme on the html element; the selectors below override
 * the GitHub-dark fallbacks with explicit GitHub-light / GitHub-dark
 * palettes so the dev entry (and any non-VS-Code host) actually
 * reflects the user's choice instead of always showing dark.
 *
 * Priority order inside a token:
 *   1. Explicit data-theme override (this block)
 *   2. VS Code host value (real VS Code webview)
 *   3. CSS fallback declared on the original property
 *
 * So the light/dark block wins when present, but a real
 * VS Code background still wins when the host supplies one. We
 * achieve that by overriding the MV-host indirection here.
 */
html[data-theme='light'] {
	--mv-bg-host: var(--vscode-editor-background, #ffffff);
	--mv-bg-soft-host: var(--vscode-sideBar-background, #f6f8fa);
	--mv-bg-card-host: var(--vscode-editorWidget-background, #ffffff);
	--mv-fg-host: var(--vscode-foreground, #1f2328);
	--mv-fg-muted-host: var(--vscode-descriptionForeground, #59636e);
	--mv-border-host: var(--vscode-widget-border, #d1d9e0);
	--mv-link-host: var(--vscode-textLink-foreground, #0969da);
	--mv-link-active-host: var(--vscode-textLink-activeForeground, #0969da);
	--mv-focus-host: var(--vscode-focusBorder, #0969da);
	--mv-error-host: var(--vscode-errorForeground, #cf222e);
	--mv-warn-host: var(--vscode-editorWarning-foreground, #9a6700);
	--mv-ok-host: var(--vscode-terminal-ansiGreen, #1a7f37);
}

html[data-theme='dark'] {
	--mv-bg-host: var(--vscode-editor-background, #1e1e1e);
	--mv-bg-soft-host: var(--vscode-sideBar-background, #252526);
	--mv-bg-card-host: var(--vscode-editorWidget-background, #252526);
	--mv-fg-host: var(--vscode-foreground, #d4d4d4);
	--mv-fg-muted-host: var(--vscode-descriptionForeground, #858585);
	--mv-border-host: var(--vscode-widget-border, #3c3c3c);
	--mv-link-host: var(--vscode-textLink-foreground, #3794ff);
	--mv-link-active-host: var(--vscode-textLink-activeForeground, #ff8c69);
	--mv-focus-host: var(--vscode-focusBorder, #007fd4);
	--mv-error-host: var(--vscode-errorForeground, #f48771);
	--mv-warn-host: var(--vscode-editorWarning-foreground, #cca700);
	--mv-ok-host: var(--vscode-terminal-ansiGreen, #89d185);
}

@media (prefers-color-scheme: light) {
	html:not([data-theme]) {
		--mv-bg-host: var(--vscode-editor-background, #ffffff);
		--mv-bg-soft-host: var(--vscode-sideBar-background, #f6f8fa);
		--mv-bg-card-host: var(--vscode-editorWidget-background, #ffffff);
		--mv-fg-host: var(--vscode-foreground, #1f2328);
		--mv-fg-muted-host: var(--vscode-descriptionForeground, #59636e);
		--mv-border-host: var(--vscode-widget-border, #d1d9e0);
		--mv-link-host: var(--vscode-textLink-foreground, #0969da);
		--mv-focus-host: var(--vscode-focusBorder, #0969da);
		--mv-error-host: var(--vscode-errorForeground, #cf222e);
		--mv-warn-host: var(--vscode-editorWarning-foreground, #9a6700);
		--mv-ok-host: var(--vscode-terminal-ansiGreen, #1a7f37);
	}
}

@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
`;
