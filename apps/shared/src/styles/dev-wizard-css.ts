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

import compiledCss from './dev-wizard.scss';

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
export const devWizardCss: string = compiledCss;
