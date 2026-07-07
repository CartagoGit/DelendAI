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

/* Print-style sanity: if the dev page ever gets printed, the
 * buttons shrink to a status indicator. */
@media print {
	.setup__cta { display: none; }
}
`;
