/**
 * `apps/shared/src/styles/dashboard/dashboard-css.ts` — the dashboard CSS
 * compiled at module-init from the sibling `dashboard.scss`. Inlined by `renderDashboard` into the
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
 * components) covers `.mcpv-header`, `.mcpv-dropdown`, `.mcpv-toast`,
 * `.mcpv-disclosure`, `.mcpv-lang-picker` etc.; this module fills the
 * dashboard-specific gap (panels, cards, tabs, KPIs, sessions rows,
 * usage bars, time histogram).
 *
 * Design constraints (slice 'fix styles: native + responsive')
 *   - **VS Code native**: every colour/font/border falls back to a
 *     `--vscode-*` theme variable so the dashboard inherits the
 *     editor's current theme (light, dark+, high-contrast, custom).
 *     Brand colours stay consistent (blue→purple gradient) by living
 *     in `--mcpv-brand-*`; everything else delegates to the host.
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

/// <reference path="../raw.d.ts" />

import { compiledCss } from './dashboard.scss';

/**
 * Compiled CSS string.
 *
 * Resolved by the SCSS Bun.build plugin in
 * `tools/scripts/dev/dev.script.ts` at build time: the plugin
 * reads `dashboard.scss` (or `dev-wizard.scss`), compiles it
 * with `sass.compileString`, and emits a string module. The
 * consumer never sees the `sass` runtime in the browser bundle
 * (the plugin already did the work).
 *
 * If the SCSS is invalid, the plugin throws at build time and
 * the dev server returns a 500 — preferable to silently shipping
 * a broken webview.
 *
 * Why a `string` and not a `.css` import? The webview contract
 * is: HTML arrives as one string assigned to `webview.html`. A
 * stylesheet loaded via `<link rel=stylesheet>` would need the
 * host to expose the file via `asWebviewUri`; bundling it inline
 * keeps the contract single-string and zero-runtime-fetch.
 */
export const dashboardCss: string = compiledCss;
