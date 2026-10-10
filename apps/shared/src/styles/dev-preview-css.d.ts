/**
 * `apps/shared/src/styles/dev-preview-css.ts` — CSS for the dev
 * preview at :5200 (and the `packages/ui-extension` dev entry on
 * :5100).
 *
 * Replaces `dev-wizard-css.ts` so the bundle sees BOTH the legacy
 * `.setup`/`.welcome`/`.settings`/`.quickstart` rules AND the new
 * shared `.delendai-*` rules. The shared renderers from f00102 (S4.5 +
 * S4.6) emit dual-class markup (`class="delendai-welcome welcome"`,
 * `class="delendai-setup setup"`, …) so each island needs both
 * namespaces; compiling only the legacy block left the new
 * `.delendai-*` selectors without rules.
 *
 * Constraints
 * ----------
 * - **No shadows / no max-width on the wizard** — matches the
 *   `dev-wizard-css.ts` baseline so the visual surface does not
 *   shift in this slice.
 * - **VS Code native first** — every colour delegates to
 *   `--vscode-*` tokens with a GitHub-dark fallback so the
 *   standalone dev entry stays legible when the host theme is
 *   not loaded yet.
 * - **Single compile string per entry** — the dev entry uses one
 *   `<style>` tag for the whole wizard so we want one CSS string,
 *   not a chain.
 *
 * Why a new file (and not a re-export over `dev-wizard-css.ts`)?
 * The two SCSS files share no `:root` selectors but DO share
 * helpers (`breakpoints`, `themes`, `tokens`); keeping them as
 * separate compilation units keeps the surface decomposed.
 */
/**
 * Compiled CSS string.
 *
 * Resolved by the SCSS Bun.build plugin in
 * `tools/scripts/dev/dev.script.ts` (`delendai-scss` plugin).
 * The plugin reads `*.scss?raw` and emits a string module via
 * `sass.compileString`, so consumers do NOT need to import `sass`.
 *
 * @internal Exported via `@delendai/ui-extension/webview` for
 *           the dev entry's CSS bootstrap.
 */
export declare const devPreviewCss: string;
