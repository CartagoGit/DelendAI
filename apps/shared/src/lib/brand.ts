/**
 * `brand.ts` — single source of truth for the brand hex literals
 * outside the SCSS theme.
 *
 * `apps/shared/src/styles/_themes.scss` declares the canonical
 * `#58a6ff` / `#a371f7` palette as CSS variables
 * (`--delendai-brand-blue`, `--delendai-brand-purple`). CSS variables are
 * not usable inside inline SVG `stop-color` attributes because the
 * SVG is rendered into webviews that do not load the shared theme
 * sheet by default. To keep the brand single-sourced, this module
 * mirrors the exact same two literals as TS constants and is the
 * only TS file allowed to mention them. The allowlist entry lives
 * in `tools/scripts/lint/no-duplicate-brand-hex.script.ts`.
 *
 * Rule of thumb: anything that needs a brand colour at runtime in
 * code imports from here; everything in styles imports from
 * `_themes.scss`.
 */
export const BRAND_HEX_BLUE = '#58a6ff';
export const BRAND_HEX_PURPLE = '#a371f7';
