/**
 * `apps/shared/src/styles/dev-wizard-css.ts` — CSS for the dev
 * preview's setup wizard (rendered inside an `<aside class="setup">`
 * by `extensions/vscode/src/dev/entry.ts`).
 *
 * Why a sibling module and not inside `dashboard-css.ts`? The
 * dashboard CSS assumes the panel/kpi/tabs chrome is on the page;
 * the wizard renders BEFORE that chrome is ready (it's the first
 * thing the user sees when a workspace isn't wired up) and needs
 * its own structure + spacing. Both ship in the same browser
 * bundle so the cost is one extra inline `<style>` block.
 *
 * Constraints (slice 'fix styles: native + responsive'):
 *   - **VS Code native**: every colour delegates to `--vscode-*`
 *     tokens with a GitHub-dark fallback so the standalone dev
 *     entry stays legible.
 *   - **Responsive, mobile-first**: wizard fills its container at
 *     any width. Action buttons stack vertically and become
 *     full-width below 600px so they're easy to tap. Signal rows
 *     reflow gracefully when there's no horizontal room.
 *   - **No shadows / no max-width**: 1px solid borders + flat
 *     surfaces, no body max-width (the wizard fills the panel).
 */

export const devWizardCss: string = `
.setup {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	font-family: var(--mv-font-prose, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
	font-size: 13px;
	color: var(--mv-fg, #d4d4d4);
	background: transparent;
	min-width: 0;
	max-width: 100%;
}

.setup__head {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px 14px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
	border-left: 3px solid var(--mv-brand-blue, #3794ff);
}
.setup__head h1 {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	letter-spacing: 0.01em;
	line-height: 1.3;
}
.setup__hint {
	margin: 0;
	color: var(--mv-fg-muted, #858585);
	font-size: 12px;
	line-height: 1.5;
}
.setup__hint code {
	font-family: var(--mv-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
	font-size: 11.5px;
	padding: 1px 4px;
	background: var(--mv-bg-card, #1e1e1e);
	border-radius: 3px;
	border: 1px solid var(--mv-border, #3c3c3c);
}

.setup__signals {
	padding: 12px 14px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
}
.setup__signals h2 {
	margin: 0 0 8px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--mv-fg-muted, #858585);
}
.setup__signals ul {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.setup__signal {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px 8px;
	padding: 6px 0;
	font-size: 12px;
	border-bottom: 1px dashed var(--mv-border, #3c3c3c);
	min-width: 0;
}
.setup__signal:last-child { border-bottom: 0; }
.setup__signal code {
	font-family: var(--mv-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
	font-size: 11.5px;
	color: var(--mv-fg, #d4d4d4);
	background: transparent;
	border: 0;
	padding: 0;
	word-break: break-all;
	min-width: 0;
}
.setup__signal-icon {
	width: 14px;
	flex: 0 0 14px;
	text-align: center;
	font-weight: 700;
}
.setup__signal-detail {
	color: var(--mv-fg-muted, #858585);
	font-size: 11.5px;
	flex: 1 1 100%;
	padding-left: 20px;
}
.setup__signal.is-on code { color: var(--mv-fg, #d4d4d4); }
.setup__signal.is-on .setup__signal-icon { color: var(--mv-ok, #89d185); }
.setup__signal.is-off .setup__signal-icon { color: var(--mv-fg-muted, #858585); }

.setup__cta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.setup__primary,
.setup__secondary {
	font: inherit;
	font-size: 13px;
	padding: 6px 14px;
	border-radius: 3px;
	cursor: pointer;
	transition: background 60ms ease, border-color 60ms ease, color 60ms ease;
	white-space: nowrap;
}
.setup__primary {
	background: var(--mv-brand-blue, #3794ff);
	color: #fff;
	border: 1px solid var(--mv-brand-blue, #3794ff);
	font-weight: 500;
}
.setup__primary:hover { filter: brightness(1.1); }
.setup__primary:focus-visible { outline: 2px solid var(--mv-focus, #007fd4); outline-offset: 2px; }
.setup__primary:disabled { opacity: 0.55; cursor: progress; }
.setup__secondary {
	background: transparent;
	color: var(--mv-fg, #d4d4d4);
	border: 1px solid var(--mv-border, #3c3c3c);
}
.setup__secondary:hover { background: var(--mv-bg-card, #1e1e1e); }
.setup__secondary:focus-visible { outline: 2px solid var(--mv-focus, #007fd4); outline-offset: 2px; }

.setup__status {
	font-size: 11.5px;
	color: var(--mv-fg-muted, #858585);
	min-width: 0;
	flex: 1 1 auto;
	word-break: break-word;
}

/* ─── Mobile: action buttons stack vertically, full width ────────── */

@media (max-width: 480px) {
	.setup { padding: 12px; gap: 10px; }
	.setup__cta { flex-direction: column; align-items: stretch; }
	.setup__primary,
	.setup__secondary { width: 100%; text-align: center; }
	.setup__status { text-align: center; }
	.setup__signal-detail { padding-left: 0; }
}

@media (min-width: 600px) {
	.setup { padding: 18px; }
}

/* ─── Status banner (dashboard view, top of #root) ──────────────── */

.mv-banner {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 12px;
	padding: 10px 14px;
	margin: 0 0 12px;
	border-radius: 4px;
	border: 1px solid var(--mv-border, #3c3c3c);
	border-left: 3px solid var(--mv-focus, #007fd4);
	background: var(--mv-bg-soft, #252526);
	font-size: 12.5px;
	color: var(--mv-fg, #d4d4d4);
}
.mv-banner--ok { border-left-color: var(--mv-ok, #89d185); }
.mv-banner--warn { border-left-color: var(--mv-warn, #cca700); }
.mv-banner--err { border-left-color: var(--mv-error, #f48771); }
.mv-banner__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	font-weight: 700;
	font-size: 12px;
	flex: 0 0 18px;
	background: var(--mv-fg-muted, #858585);
	color: var(--mv-bg, #1e1e1e);
}
.mv-banner--ok .mv-banner__icon { background: var(--mv-ok, #89d185); }
.mv-banner--warn .mv-banner__icon { background: var(--mv-warn, #cca700); }
.mv-banner--err .mv-banner__icon { background: var(--mv-error, #f48771); }
.mv-banner__msg { flex: 1 1 auto; min-width: 0; }
.mv-banner__link {
	font: inherit;
	font-size: 12px;
	padding: 4px 10px;
	border-radius: 3px;
	border: 1px solid var(--mv-border, #3c3c3c);
	background: transparent;
	color: var(--mv-link, #3794ff);
	cursor: pointer;
	white-space: nowrap;
}
.mv-banner__link:hover { background: var(--mv-bg-card, #1e1e1e); }
.mv-banner__link:focus-visible {
	outline: 2px solid var(--mv-focus, #007fd4);
	outline-offset: 2px;
}

/* ─── Settings panel (theme + lang) ──────────────────────────────── */

.settings {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	font-family: var(--mv-font-prose, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
	font-size: 13px;
	color: var(--mv-fg, #d4d4d4);
	background: transparent;
	min-width: 0;
	max-width: 100%;
}
.settings__status {
	margin: 0 0 4px;
	padding: 8px 12px;
	border-radius: 3px;
	border: 1px solid var(--mv-border, #3c3c3c);
	background: var(--mv-bg-soft, #252526);
	font-size: 12.5px;
	display: flex;
	align-items: center;
	gap: 8px;
}
.settings__status--ok { border-left: 3px solid var(--mv-ok, #89d185); }
.settings__status--warn { border-left: 3px solid var(--mv-warn, #cca700); }
.settings__status--err { border-left: 3px solid var(--mv-error, #f48771); }

.settings__form {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 12px 14px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
}
.settings__field {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	border: 0;
	min-width: 0;
}
.settings__field legend {
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--mv-fg-muted, #858585);
	padding: 0;
	margin: 0 0 4px;
}
.settings__field--inline {
	flex-direction: row;
	align-items: center;
	gap: 12px;
}
.settings__field--inline span {
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--mv-fg-muted, #858585);
	min-width: 80px;
}
.settings__hint {
	margin: 0;
	font-size: 11.5px;
	color: var(--mv-fg-muted, #858585);
	line-height: 1.5;
}
.settings__radios {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.settings__radio {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	border-radius: 3px;
	border: 1px solid var(--mv-border, #3c3c3c);
	background: var(--mv-bg-card, #1e1e1e);
	cursor: pointer;
	font-size: 12.5px;
	min-width: 0;
}
.settings__radio input[type='radio'] {
	margin: 0;
	cursor: pointer;
	accent-color: var(--mv-link, #3794ff);
}
.settings__radio:hover { border-color: var(--mv-fg-muted, #858585); }
.settings__radio:has(input:checked) {
	border-color: var(--mv-link, #3794ff);
	background: var(--mv-bg-soft, #252526);
}

.settings select {
	font: inherit;
	font-size: 13px;
	padding: 5px 8px;
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 3px;
	background: var(--mv-bg-card, #1e1e1e);
	color: var(--mv-fg, #d4d4d4);
	min-width: 120px;
	max-width: 100%;
	cursor: pointer;
}
.settings select:focus-visible {
	outline: 2px solid var(--mv-focus, #007fd4);
	outline-offset: 2px;
}

@media (max-width: 480px) {
	.settings { padding: 12px; gap: 10px; }
	.settings__field--inline { flex-direction: column; align-items: stretch; gap: 6px; }
	.settings__radios { flex-direction: column; }
	.settings__radio { width: 100%; }
}

/* Print-style sanity: if the dev page ever gets printed, the
 * buttons shrink to a status indicator. */
@media print {
	.setup__cta { display: none; }
}

/* ─── Welcome screen (first-run) ────────────────────────────────── */

.welcome {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 18px;
	font-family: var(--mv-font-prose, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
	color: var(--mv-fg, #d4d4d4);
}
.welcome__head {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 14px 16px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
	border-left: 3px solid var(--mv-brand-blue, #3794ff);
}
.welcome__head h1 {
	margin: 0;
	font-size: 17px;
	font-weight: 600;
	letter-spacing: 0.01em;
}
.welcome__head h1::before {
	content: '';
	display: inline-block;
	width: 8px;
	height: 8px;
	margin-right: 8px;
	background: var(--mv-brand-gradient, linear-gradient(135deg, #3794ff, #a371f7));
	border-radius: 2px;
	vertical-align: middle;
}
.welcome__lede {
	margin: 0;
	color: var(--mv-fg-muted, #858585);
	font-size: 12.5px;
	line-height: 1.5;
}
.welcome__lede code {
	font-family: var(--mv-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
	font-size: 11.5px;
	padding: 1px 5px;
	background: var(--mv-bg-card, #1e1e1e);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 3px;
}

.welcome__grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 10px;
}
@media (min-width: 600px) {
	.welcome__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 960px) {
	.welcome__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.welcome__card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 14px;
	background: var(--mv-bg-card, #1e1e1e);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
	min-width: 0;
}
.welcome__card:hover { border-color: var(--mv-fg-muted, #858585); }
.welcome__card-icon {
	font-size: 20px;
	line-height: 1;
	color: var(--mv-link, #3794ff);
	margin-bottom: 4px;
}
.welcome__card h3 {
	margin: 0;
	font-size: 13px;
	font-weight: 600;
	color: var(--mv-fg, #d4d4d4);
}
.welcome__card p {
	margin: 0;
	font-size: 11.5px;
	color: var(--mv-fg-muted, #858585);
	line-height: 1.5;
}

.welcome__cta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
	padding: 12px 14px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-radius: 4px;
}
.welcome__primary,
.welcome__secondary {
	font: inherit;
	font-size: 13px;
	padding: 7px 14px;
	border-radius: 3px;
	cursor: pointer;
	border: 1px solid transparent;
	white-space: nowrap;
}
.welcome__primary {
	background: var(--mv-brand-blue, #3794ff);
	color: #fff;
	border-color: var(--mv-brand-blue, #3794ff);
	font-weight: 500;
}
.welcome__primary:hover { filter: brightness(1.1); }
.welcome__primary:focus-visible {
	outline: 2px solid var(--mv-focus, #007fd4);
	outline-offset: 2px;
}
.welcome__secondary {
	background: transparent;
	color: var(--mv-fg-muted, #858585);
	border-color: var(--mv-border, #3c3c3c);
}
.welcome__secondary:hover {
	color: var(--mv-fg, #d4d4d4);
	background: var(--mv-bg-card, #1e1e1e);
}
.welcome__secondary:focus-visible {
	outline: 2px solid var(--mv-focus, #007fd4);
	outline-offset: 2px;
}

@media (max-width: 480px) {
	.welcome { padding: 12px; }
	.welcome__cta { flex-direction: column; align-items: stretch; }
	.welcome__primary,
	.welcome__secondary { width: 100%; text-align: center; }
}

/* ─── Quick start menu (above the dashboard when configured) ──── */

.quickstart {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 14px;
	margin: 0 0 12px;
	background: var(--mv-bg-soft, #252526);
	border: 1px solid var(--mv-border, #3c3c3c);
	border-left: 3px solid var(--mv-brand-purple, #a371f7);
	border-radius: 4px;
	font-family: var(--mv-font-prose, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
}
.quickstart__head {
	display: flex;
	align-items: center;
	gap: 12px;
}
.quickstart__head h2 {
	margin: 0;
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--mv-fg-muted, #858585);
	flex: 1 1 auto;
}
.quickstart__close {
	font: inherit;
	font-size: 16px;
	line-height: 1;
	color: var(--mv-fg-muted, #858585);
	background: transparent;
	border: 1px solid transparent;
	border-radius: 3px;
	padding: 2px 8px;
	cursor: pointer;
}
.quickstart__close:hover {
	color: var(--mv-fg, #d4d4d4);
	background: var(--mv-bg-card, #1e1e1e);
}
.quickstart__close:focus-visible {
	outline: 2px solid var(--mv-focus, #007fd4);
	outline-offset: 2px;
}
.quickstart__lede {
	margin: 0;
	font-size: 12px;
	color: var(--mv-fg-muted, #858585);
	line-height: 1.5;
}
.quickstart__list {
	margin: 0;
	padding: 0;
	list-style: none;
	display: grid;
	grid-template-columns: 1fr;
	gap: 8px;
}
@media (min-width: 600px) {
	.quickstart__list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.quickstart__item {
	display: flex;
	gap: 10px;
	padding: 6px 0;
	font-size: 12px;
	line-height: 1.45;
	min-width: 0;
}
.quickstart__icon {
	font-size: 14px;
	color: var(--mv-link, #3794ff);
	flex: 0 0 18px;
	text-align: center;
}
.quickstart__desc {
	color: var(--mv-fg-muted, #858585);
	display: block;
	margin-top: 2px;
}
`;
