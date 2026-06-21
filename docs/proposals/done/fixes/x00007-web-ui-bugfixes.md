---
id: x00007
status: done
type: proposal
track: web+ui
date: 2026-06-21
kind: fix
title: Web UI bugfixes — config modal sync, theme persistence, dev API regen, page title dedup, search modal in dev, themed scrollbar
shipped-in: 293837d
---

# x00005 — Web UI bugfixes (settings modal, page transitions, dev workflow, search, scrollbar)

## Goal

Close six user-visible bugs reported on the running `apps/web` dev server
(`/`, `/es/`, `/install`, `/tools`, etc.):

1. **Settings modal — language flag not highlighted**: clicking a
   `<a class="lang-opt">` changes the page language, but the flag never
   receives the `aria-current="true"` / accent border that the
   `_lang-opt.scss` SCSS expects. Cause: the settings modal is mounted
   under `transition:persist`, so the SSR-rendered `aria-current` is
   frozen at first load and never updates when the language changes
   via a view transition.
2. **Theme / language revert to default on page change**: after
   navigating between two pages, the `<html data-theme>` attribute
   briefly drops to the default and the swatch highlight is wrong.
   The inline `<script>` in `Base.astro` re-applies the theme, but
   the in-modal `aria-pressed` on the swatches and the `aria-current`
   on the flags are not re-synced after a swap.
3. **Bun dev does not rebuild the typedoc API on doc changes**:
   `apps/web/package.json#scripts.dev` runs `typedoc` once at start
   and then `astro dev`. Changes to JSDoc in `packages/*` or
   `plugins/*` are not reflected until the dev server is restarted.
4. **Several pages render the title twice**: every page under
   `apps/web/src/pages/*.astro` (tools, prompts, resources, knowledge,
   skills, benchmarks, capabilities, plugins) uses **both**
   `<PageHeader title=…>` (which renders `<h1>`) **and** the
   section component (which renders `<h2>` with the same text). The
   `install.astro` page is the only one of the section pages that
   does not have this issue, by accident — the others do. Pages
   don't look like the rest of the site.
5. **Search modal has no input box in dev**: `Search.astro` lazy-loads
   `pagefind-ui.js` + `pagefind-ui.css` from `/pagefind/`, but
   `pagefind --site dist` only runs as the last step of `astro build`.
   In dev there is no `dist/`, so the assets 404, the widget never
   mounts, and the modal is empty.
6. **Scrollbar ignores the active theme**: native scrollbar is the
   OS default. In dark themes it clashes with the dark palette;
   in light themes it shows the wrong foreground.

## Why

All six are visible at first paint of the running dev server; they
block any external user from evaluating the site. The repo's
definition of done (`AGENTS.md`) is `bun run validate` green plus
user-visible defects closed.

## Slices

### S1 — Settings modal: keep `aria-current` and `aria-pressed` in sync across view transitions
  - **Status**: ready
  - **Files**: `apps/web/src/components/Config.astro` (add
    `markActiveLang()` that reads `<html lang>` and sets
    `aria-current="true"` on the matching `.lang-opt`; call it from
    `setupConfig()` and from an explicit `astro:after-swap` listener
    so the persist-mounted modal re-syncs without remounting),
    `apps/web/src/layouts/Base.astro` (move the theme-restore inline
    script into a real `<script>` that registers an
    `astro:after-swap` listener and re-applies `data-theme` /
    `data-motion` from `localStorage` on every navigation; replace
    the inline `is:inline` shim — it does not re-run after the
    first page).
  - **Accept**: with `localStorage` holding `mcpvertex-theme=light`
    and `mcpvertex-motion=off`, navigating `/` → `/tools` → `/es/`
    keeps the theme accent and the highlight on the right swatch;
    on `/es/`, the Spanish flag in the modal has
    `aria-current="true"` and the accent border.

### S2 — `bun run dev` regenerates typedoc on doc changes
  - **Status**: ready
  - **Files**: `apps/web/package.json` (split `dev` into
    `typedoc --watch` running in parallel with `astro dev` via
    `bun --cwd ../.. docs:api:watch`, which is `typedoc --watch`
    when `--watch` is set; fall back to a one-shot `typedoc` when
    the env var `WEB_DEV_WATCH=0` is set so CI doesn't spawn a
    watcher).
  - **Accept**: editing a JSDoc comment in `packages/core/src/...`
    updates the rendered API page in `apps/web/public/api/` within
    ~2 s without restarting the dev server.

### S3 — Per-page single title (no more double H1/H2)
  - **Status**: ready
  - **Files**: `apps/web/src/pages/{tools,prompts,resources,knowledge,skills,benchmarks,capabilities,plugins}.astro`
    (remove `<PageHeader title=… />` and pass the title as a
    prop to the section component instead), and each of
    `apps/web/src/components/{ToolsSection,PromptsSection,ResourcesSection,KnowledgeSection,SkillsSection,BenchmarksSection,PluginCapabilities}.astro`
    (replace the inner `<h2>` with `<h1>` and accept the title via
    props, defaulting to the i18n key for back-compat). The
    `PageHeader.astro` component stays for pages that genuinely
    need a separate intro (404, install, guide, [lang]/404,
    [lang]/index, status/logs, status/recovery, plugins/loop-detector).
  - **Accept**: each of the eight affected pages has exactly one
    `<h1>` and the page no longer looks visually off compared to
    `/install` and `/guide`.

### S4 — Search modal: dev fallback (mini client-side index)
  - **Status**: ready
  - **Files**:
    `apps/web/src/pages/api/dev-search.json.ts` (new — Astro
    endpoint that returns `{title, href, text}[]` for every page
    in `apps/web/src/pages/*.astro` + `apps/web/src/pages/[lang]/*.astro`,
    scraping the rendered HTML and stripping tags; **dev-only**,
    gated by `import.meta.env.DEV` so the build does not ship it),
    `apps/web/src/components/Search.astro` (on `loadPagefind`
    failure — detect via the `<script>`'s `onerror` — fall back to
    a small client-side widget: an `<input>` + a `<ul>` that
    filters the dev-search index on `input`; reuse the same
    `--pagefind-ui-*` CSS variable theme so the fallback looks
    the same as the production widget).
  - **Accept**: in dev, opening the search modal shows an input
    field; typing "install" returns a hit pointing to
    `/install`; in production (`astro build`), the Pagefind
    widget is the one mounted, the dev endpoint is not generated.

### S5 — Themed scrollbar
  - **Status**: ready
  - **Files**: `apps/web/src/styles/_reset.scss` (add a
    `::-webkit-scrollbar` + `::-webkit-scrollbar-thumb` rule that
    uses `var(--line)` and `var(--muted)`; add the equivalent
    `scrollbar-color` and `scrollbar-width` for Firefox).
  - **Accept**: switching themes (`dark` → `light` → `solarized`)
    updates the scrollbar palette immediately.

## Non-goals

- Replacing the persist-mounted modals with a portal; the persist
  pattern is intentional and the fix is local to the modal scripts.
- A live HMR for the typedoc-generated HTML in production builds
  (`bun run site`); the proposal only covers the dev workflow.
- Replacing the Section `<h2>` pattern in unrelated pages (e.g.
  the home's `ConceptSection`); those are intentional sub-headings.

## Acceptance

- [x] `bun run validate` is green (133 test files, 943 tests pass).
- [x] `apps/web` builds (`bun run site:strict`).
- [x] Manual smoke (the six bullets in §Goal) all pass — verified
      in the browser via Playwright on `/`, `/es/`, `/tools/`:
      cfg modal flags re-sync, theme persists across navigations,
      search modal has a working input + filter, scrollbar matches
      the active theme, dev script regenerates typedoc.

## risks and mitigations

- **R1 — `astro:after-swap` script runs before the modal is
  re-bound**: mitigated by gating the new `markActiveLang()` on
  `#cfg-modal` being present in the DOM.
- **R2 — `typedoc --watch` leaks handles on hot reload**: a single
  long-running `typedoc --watch` is intentional; `astro dev` is
  the only watcher.
- **R3 — S4 dev endpoint size**: cap the index at 200 pages; the
  per-page payload is the title + first 240 chars of body.

## notes

- Master audit: `docs/proposals/audits/a1-16-06-2026-…md` (M3 / M27
  follow-ups — UI polish on the web). The audit file moved to
  `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
  in the same commit (293837d) that shipped the fixes; the `R`
  rename in the diff stat showed up as a `D` line, which initially
  looked like data loss.
- Companion proposal: `f00030-web-deep-pages-and-search.md` (S2
  Pagefind; this proposal extends the dev-time ergonomics around
  it).
- `apps/web/src/components/Config.astro`,
  `apps/web/src/components/Search.astro`,
  `apps/web/src/layouts/Base.astro` — the three files doing
  most of the work.

## Verification (post-ship)

Re-verified in the dev server at `http://localhost:5000/` after
`293837d` landed:

- **/tools** (English): `<h1>Tools</h1>` — single title; the
  PageHeader was removed and the section component owns the heading.
- **/es/** (Spanish): cfg modal opens with the Spanish flag
  highlighted (`aria-current="true"`), the "Tema" group has the
  active theme swatch pressed (`aria-pressed="true"`), and the
  modal copy is in Spanish ("Ajustes", "Tema", "Idioma",
  "Movimiento").
- **Theme persists across navigation**: clicking the light swatch
  on `/tools`, navigating to `/es/`, and reloading the browser all
  keep `data-theme="light"` and the swatch pressed.
- **Search modal in dev**: opening the search icon mounts an
  `<input>` + result list (the dev fallback), typing `install`
  filters to 2 results (`Install & run` + `Guide`), clicking a
  result navigates to the matching page.
- **Scrollbar matches theme**: Firefox's `scrollbar-color` and
  the WebKit `::-webkit-scrollbar-thumb` palette follow
  `var(--muted)` and `var(--accent)` from `_themes.scss`; switching
  from `midnight` to `light` updates the bar immediately.
- **typedoc --watch**: `bun run dev` from `apps/web` spawns
  `typedoc --watch` in the background and `astro dev` in the
  foreground; the API HTML at `apps/web/public/api/` regenerates
  on every save of a JSDoc comment.
