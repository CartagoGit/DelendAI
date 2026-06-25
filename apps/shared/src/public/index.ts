/**
 * Public surface of `@mcp-vertex/shared`.
 *
 * S1 ships design tokens + themes; S2 fills in the i18n contract
 * (`Lang`, `ILangDict`, the 12 merged language dictionaries); S3+ adds
 * the host-agnostic runtime components exported by
 * `@mcp-vertex/ui-extension`.
 *
 * Downstream surfaces import from here:
 *
 *   import { Lang, ILangDict } from '@mcp-vertex/shared';
 *   @use '@mcp-vertex/shared/styles' as *;
 */

export type { Lang, ILangDict, ILangMeta } from '../i18n/shared';
export {
	languages,
	rtlLangs,
	defaultLang,
	themes,
	flagFor,
} from '../i18n/shared';
export type { Theme } from '../i18n/shared';

// Host-agnostic UI primitives. The S6 slice (`f00047`) replaced the
// site/extension hand-rolled "More" dropdowns with the shared
// `renderDropdown`, which lives in `@mcp-vertex/ui-extension` and is
// re-exported here so every consumer imports it from one stable place:
// `@mcp-vertex/shared`. Downstream consumers must NOT depend on
// `@mcp-vertex/ui-extension` directly — that's an internal alias host.
//
// `renderDropdown` is the runtime HTML for an accessible disclosure
// (button + panel + outside-click + Esc + aria attributes + CSS
// transitions). It returns an HTML string suitable for Astro's
// `set:html` directive. See `packages/ui-extension/src/components/
// dropdown.ts` for the implementation and `tests/components/dropdown
// .spec.ts` for the contract.
export { renderDropdown } from '@mcp-vertex/ui-extension';

// `renderRuntime` is the `<script>` that drives every `mv-dropdown`
// (and other `[data-mv-toggle]` / `[data-mv-action]` host gestures)
// on the page. Hosts (the docs site, the VS Code webview) inject it
// once per page; without it, dropdowns render as markup but never
// open. It is the same string whether the host is a webview or a
// plain HTML page — the only host-specific piece is
// `window.__MV_HOST__`, which the docs site leaves as the no-op
// default since menu items now carry real `href`s.
export { renderRuntime } from '@mcp-vertex/ui-extension';
