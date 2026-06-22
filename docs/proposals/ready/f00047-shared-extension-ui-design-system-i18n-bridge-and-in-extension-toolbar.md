---
id: f00047
kind: feat
title: shared extension UI — design system, i18n bridge, webview primitives and in-extension toolbar
status: ready
type: proposal
track: ui-extension+web+vscode+scss+i18n
date: 2026-06-22
shipped-in: []
related:
    - a00025
    - a00026
    - f00026
    - f00037
    - f00045
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:scss, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run --cwd extensions/vscode check:i18n, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00047 — Shared extension UI: design system, i18n bridge, webview primitives and in-extension toolbar

## Goal

Make every host extension (VS Code today, future hosts tomorrow) and the
product site look and feel like one product, **without rewriting CSS or
duplicating i18n**. Concretely, this proposal ships four things on top
of the existing `@mcp-vertex/ui-extension` host-agnostic renderer:

1. **`apps/shared/`** — a new package that owns brand tokens (CSS
   custom properties), a small BEM-style component library (header bar,
   dropdown with CSS transition, language picker, disclosure /
   collapsible, toast, kbd hint), the i18n contract (`Lang`, `ILangDict`)
   and the **12 canonical language dictionaries** consumed by both
   `apps/web` and every host extension.
2. **A webview/host-agnostic runtime** in `@mcp-vertex/ui-extension`
   that renders the components inside any webview, theme-aware, with
   no host imports. The runtime ships pre-compiled CSS (via the SCSS
   in `apps/shared/styles`) so a host extension imports one CSS file
   and one JS entry — no Sass build, no per-host `<style>` rewrite.
3. **An in-extension header** with a settings dropdown (theme,
   language, log level, allowLocalhost, allowPrivateIps), a language
   dropdown (the same component the site uses), and a quick-actions
   toolbar that surfaces the repo's most useful entry points
   (proposals board, knowledge navigator, logs, docs, run validation,
   restart server, show overview, open dashboard).
4. **An in-extension "tools" quick-action surface** (command palette
   helpers + status-bar mini-buttons) that calls into existing
   `proposals_*`, `memory_*`, `quality_*`, `docs_*`, `logs_*`, `git_*`,
   `deps_*`, `notification_*` tools without the user having to remember
   tool names — wired through the existing `IHostAdapter` so other
   hosts can drop it in.

The result is: **one source of truth for brand, language, and the
small set of UI primitives every extension needs**, plus a
**header + dropdown + language picker + toolbar** baked into every
extension panel.

## Why

Three audits (`a00025`, `a00026`, plus the cross-cutting audits) keep
flagging the same root cause:

| Audit | ID | Finding | Severity |
|---|---|---|---|
| Unified audit | `H-I18N-DUP` | `apps/shared/` does not exist; 12 langs duplicated between `apps/web` and `extensions/vscode` with diverging shapes (nested vs flat) | P2 |
| Repo audit | `H-I18N-DUP` (deferred to S2) | Same root cause; explicitly proposed extraction to `apps/shared/i18n/` | P2 |
| Brand audit | `x00010` | Brand assets (`logo.svg`, `logo-mono.svg`) re-shipped byte-identically from `apps/web/public/` to `extensions/vscode/media/` with no single source | P3 |

Today, three webviews (Dashboard, Knowledge, Settings, Tool Detail) each
redefine the brand palette inline; a designer changing the primary
hex has to touch `apps/web/src/styles/_themes.scss` **and**
`extensions/vscode/media/dashboard.css` **and** the inline `<style>` of
`packages/ui-extension/src/knowledge/render-knowledge-navigator.ts` —
and the brand SVGs are duplicated under `apps/web/public/logo.svg` and
`extensions/vscode/media/logo.svg`. The same 12 dicts exist twice with
different shapes, so adding a 13th language is two PRs in two repos.

This proposal makes both go away: one `apps/shared/styles/_tokens.scss`
source for color/spacing/radius, one `apps/shared/i18n/langs/<code>.ts`
for translations, and the webview component runtime consumes both via
the `@mcp-vertex/ui-extension` barrel.

The user-facing part is also real: every host extension today is a
wall of command-palette entries plus a status-bar click. There is no
header, no language picker, no theme switcher, no in-extension quick
actions. Users who don't know the command name (`mcp-vertex.open
KnowledgeNavigator`) can't reach the panel. This proposal adds the
header + dropdown + toolbar that every webview panel shares.

## Why this design

- **`apps/shared/` is a separate package, not a folder inside
  `apps/web`.** The site stays a downstream consumer; host extensions
  become peers. This mirrors the same `@mcp-vertex/ui-extension`
  split: a renderer consumed by every host, not a fork of the site.
- **CSS custom properties, not Sass in every webview.** Webviews cannot
  run a Sass build at runtime. We compile `_tokens.scss` and the small
  component partials into one CSS file that ships from
  `@mcp-vertex/shared/styles` and is loaded by `IHostAdapter.loadWebview`.
- **One i18n shape (`LangDict`)**, merging the nested site shape and
  the flat extension shape into a single nested object with extension
  keys under a top-level `extension` namespace. Existing translations
  are migrated 1:1; the 12 lang files are moved, not rewritten.
- **Components are framework-free vanilla TS** (template literals +
  `data-mv-*` attributes + a small `mv.on(root, '.dropdown',
  'click', handler)` delegation helper). No React, no Lit, no Web
  Components — every host already renders a static HTML string into a
  webview; we just give the string structure.
- **The in-extension toolbar is a single webview panel**
  (`mcp-vertex.toolbar`) that uses `IHostAdapter` exclusively; no
  direct `vscode` imports, so it ports to other hosts by swapping the
  adapter.
- **Quick actions are a registry** (`@mcp-vertex/ui-extension` exports
  `QuickAction` type + `defaultQuickActions()`), and the host picks
  which subset to expose. This avoids baking host-specific actions
  into the shared package.

## Non-goals

- Replacing the existing `apps/web` SCSS 7-1 architecture. The site
  keeps its BEM partials; they just import from `apps/shared/styles`
  instead of redefining tokens.
- Migrating to a different i18n library (i18next, FormatJS, etc.). The
  shape stays nested objects + a `t()` helper that already exists in
  `apps/web/src/i18n/shared.ts`.
- Adding a 13th language. This proposal ships the plumbing; new
  languages are added later by adding one file under
  `apps/shared/i18n/langs/`.
- Building a React/Lit/web-component shell. Vanilla TS strings + a
  tiny event helper keep the runtime < 12 KB gzipped.
- Replacing `IHostAdapter.showQuickPick`. That stays as the host-native
  fallback for hosts that don't render the toolbar webview.

## Slices

### S1 — `apps/shared/` package skeleton with build, exports and token ownership

- **Files** (new):
  `apps/shared/package.json`,
  `apps/shared/tsconfig.json`,
  `apps/shared/src/public/index.ts` (barrel),
  `apps/shared/src/styles/_tokens.scss`,
  `apps/shared/src/styles/_themes.scss`,
  `apps/shared/src/styles/styles.scss`,
  `apps/shared/README.md`
- **Files** (moved + rewired, ownership stays):
  `apps/web/src/styles/_tokens.scss` → re-exports from
  `apps/shared/src/styles/_tokens.scss`,
  `apps/web/src/styles/_themes.scss` → re-exports from
  `apps/shared/src/styles/_themes.scss`,
  `apps/web/src/styles/styles.scss` → `@use 'apps/shared/...';` at top,
  `apps/web/scripts/check-i18n.ts` → unchanged contract, reads from
  `apps/shared/i18n/langs/` after S2.
- **Status**: done (commit 12bc1d3)
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "`apps/shared` is a workspace package with `name:
    '@mcp-vertex/shared'`, `main: src/public/index.ts`, `exports: {
    '.': ..., './styles': './src/styles/_index.scss', './i18n':
    './src/i18n/index.ts' }`, `private: true`."
  - "`_tokens.scss` exports `--mv-radius`, `--mv-maxw`, `--mv-gap`,
    `--mv-font-mono`, `--mv-font-prose`, and the spacing scale
    (`--mv-s-1` … `--mv-s-6`). Site token imports remain
    backward-compatible (`@use 'apps/shared/styles/tokens'` works)."
  - "`_themes.scss` owns the five palettes (`dark`, `light`,
    `midnight`, `solarized`, `nord`) with the hex constants
    `--mv-brand-blue: #58a6ff` and `--mv-brand-purple: #a371f7` as the
    **only** definitions in the repo (the literals in
    `extensions/vscode/media/dashboard.css` are removed in S4)."
  - "`bun run build` includes `apps/shared` in the workspace graph
    (`tsconfig.json` `references` + root `package.json` `workspaces`).
    `bun run typecheck` is green."

### S2 — i18n bridge: 12 lang dicts moved to `apps/shared/i18n/langs/`

- **Files** (new):
  `apps/shared/src/i18n/shared.ts` (`Lang`, `ILangDict`,
  `t(dictionary, path, vars)`),
  `apps/shared/src/i18n/index.ts`,
  `apps/shared/src/i18n/langs/{ar,de,en,es,fr,hi,it,ja,pt,th,vi,zh}.ts`
- **Files** (rewired):
  `apps/web/src/i18n/shared.ts` → re-exports types from
  `apps/shared/i18n/shared`; existing `ITranslations` extends
  `ILangDict`; site dicts under `apps/web/src/i18n/langs/*.ts` are
  merged into the shared dicts and re-exported,
  `extensions/vscode/src/i18n/index.ts` → re-exports
  `dictsByLang` from `@mcp-vertex/shared/i18n`,
  `extensions/vscode/src/i18n/langs/*.ts` → deleted (moved to
  `apps/shared/i18n/langs/`),
  `apps/web/scripts/check-i18n.ts` → reads
  `apps/shared/i18n/langs/` (12 langs × full key set).
- **Status**: done (commit b50c3d2)
- **Gate**: `bun run --cwd extensions/vscode check:i18n`
- **Acceptance**:
  - "`ILangDict` is the single shape with three top-level keys:
    `site` (existing nested site dict), `extension` (existing flat
    extension dict lifted under a namespace), `tools` (new, empty
    placeholders reserved for future tool result translations)."
  - "Each of the 12 lang files defines all three sections. Existing
    translations are preserved verbatim; the `extensions/vscode/i18n`
    flat dicts become the `extension` section of the shared dict."
  - "`bun run --cwd extensions/vscode check:i18n` reports `12
    languages × <totalKeys> keys` with zero missing entries."
  - "`apps/web/scripts/check-i18n.ts` reads from
    `apps/shared/i18n/langs/` and still passes (12 langs, full
    parity)."

### S3 — `@mcp-vertex/ui-extension` webview component runtime (header, dropdown, disclosure, language picker)

- **Files** (new):
  `packages/ui-extension/src/components/header-bar.ts`,
  `packages/ui-extension/src/components/dropdown.ts`,
  `packages/ui-extension/src/components/disclosure.ts`,
  `packages/ui-extension/src/components/language-picker.ts`,
  `packages/ui-extension/src/components/toast.ts`,
  `packages/ui-extension/src/components/runtime.ts` (the
  `mv.runtime(root)` entry: event delegation, CSS variables resolution),
  `packages/ui-extension/src/components/styles.css.ts` (small CSS
  template literal exporting the component CSS strings).
- **Files** (rewired):
  `packages/ui-extension/src/public/index.ts` → exports
  `HeaderBar`, `Dropdown`, `Disclosure`, `LanguagePicker`, `Toast`,
  `createRuntime`, all the `<deprecationAlias>` of the same plus
  `renderHeaderBar`, `renderDropdown`, etc. (HTML-string entry),
  `packages/ui-extension/src/dashboard/render-dashboard.ts` →
  composes `HeaderBar` + `LanguagePicker` + the existing KPI strip +
  tabs (no inline styles).
- **Status**: pending
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "Each component is exported both as a TS function returning an
    `HTMLElement` (for hosts that mount a DOM root) and as a
    `renderXxx(options) => string` HTML-string helper (for hosts that
    render strings). Both produce the same DOM."
  - "`Dropdown` opens on click with a CSS `transition` on
    `transform: translateY(...)` and `opacity` (180ms ease-out),
    closes on outside-click and on `Esc`. No JS animation libraries."
  - "`Disclosure` uses `<details>`/`<summary>` under the hood with the
    MV chevron icon, so it works without the runtime attached."
  - "`LanguagePicker` reads `navigator.language`, falls back to
    `'en'`, calls `IHostAdapter.setLanguage(lang)` and writes
    `localStorage['mv:lang']`."
  - "`createRuntime(root)` wires `data-mv-action`, `data-mv-toggle`
    and `data-mv-lang` attribute delegation so hosts don't need to
    add per-action listeners."
  - "Tests cover: dropdown opens/closes, disclosure toggles, language
    picker emits `setLanguage`, runtime dispatches by attribute."

### S4 — Host extensions consume the shared runtime and CSS

- **Files** (rewired):
  `extensions/vscode/src/host/vscode-host-adapter.ts` → injects
  `<link rel="stylesheet" href="${asWebviewUri('@mcp-vertex/shared/styles')}">`
  into every webview it creates, before any host CSS,
  `extensions/vscode/src/extension.ts` → calls
  `setLanguage` from the runtime when the user picks a new language
  (persisted in `globalState['mv:lang']`),
  `extensions/vscode/src/views/tool-detail-webview.ts` → renders with
  `renderHeaderBar(...)` + `renderLanguagePicker(...)` + the existing
  tool detail body; the hand-written
  `extensions/vscode/media/dashboard.css` becomes
  `extensions/vscode/media/extension-overrides.css` and contains only
  what `@mcp-vertex/shared/styles` does **not** cover (VS Code theme
  fallbacks for `--vscode-editor-background` etc.),
  `packages/ui-extension/src/knowledge/render-knowledge-navigator.ts` →
  uses `renderHeaderBar` and the language picker; the inline `<style>`
  block is removed,
  `packages/ui-extension/src/settings/render-settings.ts` → uses
  `renderHeaderBar` and the disclosure primitive for the form
  sections.
- **Files** (new):
  `extensions/vscode/media/logo.svg` is symlinked-or-copied **at
  build time** from `apps/shared/brand/logo.svg` (a new file under
  `apps/shared/brand/`); the source of truth lives there. A
  `tools/scripts/sync-brand-assets.script.ts` regenerates the
  per-host copies on `bun run build`.
- **Status**: pending
- **Gate**: `bun run lint:scss` + `bun run validate`
- **Acceptance**:
  - "Every webview the VS Code host opens
    (`mcp-vertex.dashboard`, `mcp-vertex.knowledge`,
    `mcp-vertex.settings`, `mcp-vertex.toolDetail`) loads
    `@mcp-vertex/shared/styles` via `asWebviewUri`. There is no
    `dashboard.css` token duplicated by hand."
  - "`extensions/vscode/media/dashboard.css` is ≤ 60 lines (was ~95),
    contains only `--vscode-*` fallbacks and VS Code-specific
    adjustments, and is the **only** file under `extensions/vscode/media/`
    that contains a literal hex constant — the lint rule
    `tools/scripts/lint/no-duplicate-brand-hex.script.ts` (new, in
    this slice) fails the build if any other file does."
  - "The brand SVGs at `apps/web/public/logo.svg`,
    `apps/web/public/logo-mono.svg`, `extensions/vscode/media/logo.svg`,
    `extensions/vscode/media/logo-mono.svg` are byte-identical and
    regenerated by `bun run build` from `apps/shared/brand/`.
    `bun run lint:brand` is green."
  - "The host language switcher persists in
    `globalState['mv:lang']` and is read on activation to seed the
    shared `LangDict`. Switching language inside the dashboard also
    updates the command labels (re-rendered) and the tree views
    via the existing `onDidChangeConfiguration` listener."

### S5 — In-extension toolbar panel and `defaultQuickActions()` registry

- **Files** (new):
  `packages/ui-extension/src/toolbar/render-toolbar.ts` (the panel
  HTML + wiring),
  `packages/ui-extension/src/toolbar/quick-actions.ts`
  (`QuickAction` type, `defaultQuickActions(): QuickAction[]`,
  `filterByHost(actions, host): QuickAction[]`),
  `packages/ui-extension/src/toolbar/quick-actions.spec.ts`
- **Files** (rewired):
  `packages/ui-extension/src/public/index.ts` → exports
  `renderToolbar`, `defaultQuickActions`, `QuickAction`,
  `extensions/vscode/src/commands/types.ts` → adds
  `mcp-vertex.openToolbar` command,
  `extensions/vscode/src/commands/open-toolbar.ts` (new),
  `extensions/vscode/src/extension.ts` → registers
  `mcp-vertex.openToolbar` in `contributes.commands` and the
  activity-bar container `mcp-vertex.toolbar`,
  `extensions/vscode/package.json` → adds
  `viewsContainers.activitybar[].id: 'mcp-vertex.toolbar'` and the
  `mcp-vertex.openToolbar` command entry.
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`defaultQuickActions()` returns the canonical set:
    `proposals.board`, `knowledge.openNavigator`, `logs.openToday`,
    `docs.openApi`, `quality.runValidation`, `git.status`,
    `memory.search`, `notification.test`, `deps.check`,
    `web.fetch`. Each action carries a stable `id`, an i18n
    `labelKey`, an `icon`, a `command` string the host dispatches,
    and a `category: 'proposals' | 'knowledge' | 'logs' | ...`."
  - "`renderToolbar({ host, lang, actions })` returns the HTML string
    for the toolbar webview: a header bar (from S3), a 3-column grid
    of action cards grouped by category, each card using the
    language-picker labels and the brand chevron. The webview
    dispatches `data-mv-action='<id>'` events to the host."
  - "The VS Code host registers a new webview panel
    `mcp-vertex.toolbar` and a new activity-bar icon that opens it.
    Clicking a card calls `vscode.commands.executeCommand(action.command)`
    which resolves to the existing 14 commands (or to a new
    `mcp-vertex.openToolbar` when the action is to open another
    panel). No new domain logic is introduced; the toolbar is pure
    UI over existing commands."
  - "`filterByHost(actions, 'vscode')` returns the same set today;
    the seam exists so a future `'jetbrains'` or `'web'` host can
    drop the VS Code-only actions (`git.status` requires the
    `git` plugin and the `vscode` SCM). The function is covered by
    a unit test with a fake plugin manifest."
  - "`bun run validate` is green and the new toolbar panel renders
    with the same brand and language as the rest of the extension."

### S6 — Docs site consumes the shared package; brand asset provenance doc updated

- **Files** (rewired):
  `apps/web/astro.config.mjs` → adds `vite.resolve.alias` for
  `@mcp-vertex/shared` (workspace package),
  `apps/web/src/styles/styles.scss` → uses tokens from
  `@mcp-vertex/shared/styles` as the base; BEM partials
  (`_btn`, `_toggle`, `_lang-opt`, `_chip`, `_nav`, `_drawer`,
  `_modal`, `_hero`, `_stat`, `_page-header`) keep their styles but
  reference shared CSS variables,
  `apps/web/src/components/SiteNav.astro` → replaces its hand-rolled
  `More` dropdown with `<Dropdown>` from
  `@mcp-vertex/ui-extension` (rendered string into the page),
  `apps/web/src/i18n/index.ts` → re-exports the merged `LangDict`
  from `@mcp-vertex/shared/i18n`,
  `docs/IDE-EXTENSION.md` → adds a `Shared UI surface` section
  explaining the header, language picker, dropdown, and toolbar
  come from `@mcp-vertex/ui-extension` (which consumes
  `@mcp-vertex/shared`), with a short note that brand assets live
  under `apps/shared/brand/`,
  `docs/FILE-CONVENTIONS.md` → notes the new package layout.
- **Status**: pending
- **Gate**: `bun run validate` + `bun run site`
- **Acceptance**:
  - "`bun run site` builds with the shared package wired in. The
    site header, dropdown, and language picker render with the same
    brand and behavior as the extension header."
  - "`apps/web` imports from `@mcp-vertex/shared` and from
    `@mcp-vertex/ui-extension`; it does **not** redefine any token
    or any component that the shared package provides. The
    `no-duplicate-brand-hex` lint from S4 stays green."
  - "`docs/IDE-EXTENSION.md` and `docs/FILE-CONVENTIONS.md` reflect
    the new package; a grep for `'#58a6ff'` and `'#a371f7'` across
    the repo returns exactly two hits: the two tokens in
    `apps/shared/src/styles/_themes.scss`."
  - "`bun run validate` is green (typecheck + lint + lint:scss +
    lint:tools + check:i18n + tests)."

## Acceptance

- One package (`@mcp-vertex/shared`) owns brand tokens, design tokens,
  the i18n contract, and the 12 canonical lang dicts.
- `@mcp-vertex/ui-extension` exposes the shared runtime (`HeaderBar`,
  `Dropdown`, `Disclosure`, `LanguagePicker`, `Toast`,
  `createRuntime`, `renderToolbar`, `defaultQuickActions`) — all
  framework-free, all webview/host-agnostic.
- Every webview in the VS Code host (dashboard, knowledge, settings,
  tool detail, toolbar) renders the shared header, language picker
  and dropdown with a CSS-transition animation, and consumes the
  shared stylesheet via `IHostAdapter.loadWebview`.
- Brand assets live in one folder (`apps/shared/brand/`) and are
  regenerated into per-host `media/` and `public/` directories by
  `bun run build`. The `lint:brand` and `lint:no-duplicate-brand-hex`
  gates enforce single source of truth.
- The extension gains a new activity-bar entry (`mcp-vertex.toolbar`)
  that surfaces the repo's most useful quick actions
  (`proposals_*`, `knowledge_*`, `logs_*`, `docs_*`, `quality_*`,
  `git_*`, `memory_*`, `notification_*`, `deps_*`, `web_fetch`) via
  cards grouped by category, without adding any new domain logic.
- `apps/web` consumes `@mcp-vertex/shared` and
  `@mcp-vertex/ui-extension`; it does not redefine anything the
  shared package provides.
- `bun run validate` is green. i18n parity (`12 langs × <full key
  set>`) is preserved across both surfaces.

## Notes

- The `@mcp-vertex/shared` package is `private: true`. It is internal
  infrastructure for `mcp-vertex` itself and is not published.
- The `defaultQuickActions()` set is the **floor**, not the ceiling:
  hosts can extend it via `additionalQuickActions` (S5 acceptance).
  New plugins automatically get a card when their
  `plugin.manifest.tools[].quickAction` declares one (S5 defers the
  auto-discovery to a follow-up; the floor covers the 10 most common
  entry points today).
- The shared CSS variables are **deliberately not themed by host**:
  the `--mv-brand-*` tokens are constant, the `--vscode-*` tokens
  are injected via `IHostAdapter` to provide the host fallback.
  This keeps the brand consistent across the site and every host.
- The dropdown transition is **CSS-only** (`transition: transform
  180ms ease-out, opacity 180ms ease-out`); no JS animation. This
  honors the `prefers-reduced-motion` media query via a single rule
  in `_tokens.scss` and survives the webview CSP.
- This proposal does **not** block f00045 (log link from chat error);
  f00045 wires the click affordance into existing commands, and the
  new toolbar in S5 surfaces a `logs.openToday` action that is a
  separate, complementary entry point.
- The `lint:no-duplicate-brand-hex` gate is the structural guarantee
  that future PRs don't reintroduce the duplication. The rule lives
  at `tools/scripts/lint/no-duplicate-brand-hex.script.ts` and walks
  the workspace, allowing the two literals **only** in
  `apps/shared/src/styles/_themes.scss` and
  `apps/shared/src/i18n/shared.ts` (the latter uses them as a
  comment reference). It fails the build otherwise.