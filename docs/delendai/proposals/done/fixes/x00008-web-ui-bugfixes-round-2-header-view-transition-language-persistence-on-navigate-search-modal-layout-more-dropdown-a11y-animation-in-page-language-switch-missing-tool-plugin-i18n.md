---
id: x00008
status: done
type: proposal
track: web+ui
date: 2026-06-21
kind: fix
title: Web UI bugfixes round 2 — header view-transition, language persistence on navigate, search modal layout, More dropdown a11y + animation, in-page language switch, missing tool/plugin i18n
shipped-in: 01de303, 2759c7a, efca64a
---

# x00007 — Web UI bugfixes round 2 (post-x00005)

## Goal

Close the second wave of user-visible bugs the user reported on top of
the x00005 fixes (settings modal sync, themed scrollbar, etc.). Six bugs
from the user + one I caught while diagnosing.

1. **Header has weird view-transitions on every navigation**: the
   `SiteNav` and `SiteFooter` carry both `transition:persist` AND
   `transition:name="site-nav"` / `"site-footer"`. The `name`
   triggers a morph between the old and new state of the nav, but
   the nav contents (hrefs, labels) change with the language, so
   the morph produces a visible flicker and the nav briefly sits
   behind / on top of `<main>`. Same problem on the modals
   (`cfg-modal`, `search-modal`, `nav-drawer`).
2. **Language reverts to the original on page change (but reload
   remembers it)**: the nav is mounted once and `transition:persist`-ed,
   so its SSR-rendered hrefs in the original language stay in the
   DOM after a view transition. The `html[lang]` does change, but
   the nav's anchors still point at the old locale's pages. Reload
   triggers a fresh SSR pass that reads the new `lang` and renders
   the right hrefs, which is why reload works. Fix: re-bind the
   nav's hrefs on `astro:after-swap` from a single source of truth
   (`<html lang>` + current pathname).
3. **Search modal jumps when results appear/disappear**: the
   `.modal__panel` is vertically centered with
   `top: 50%; transform: translateY(-50%)` and `max-height:
   calc(100vh - 2rem)`. When the inner results list grows or
   shrinks, the panel's height changes and it re-centers, so the
   top edge moves. Fix: pin the top offset so the panel does not
   drift.
4. **"More" dropdown doesn't close on outside click and has no
   animation**: the current implementation uses a native
   `<details>`/`<summary>`, which (a) closes on the second toggle
   of the *same* element, not on outside click, and (b) has no
   smooth open/close animation. Fix: replace with a
   `<button aria-expanded>` + popover-style div, drive the open
   state with a script, and animate with a `transform: scaleY` +
   `opacity` transition.
5. **Language switch on `/plugins` redirects to `/` (the home
   for that locale)**: the `<a class="lang-opt" href="/es/">`
   always points to the locale root, regardless of which page
   the user is on. On `/plugins`, the user expects the same
   page in the new locale (`/es/plugins`). Fix: compute the
   in-page target URL from the current pathname + the new locale.
6. **Header sometimes appears behind the content** during
   navigation: same root cause as bug 1 — the `transition:name`
   morph briefly mis-layers the nav. Fixed by removing
   `transition:name` from persist elements.
7. **Tool / plugin descriptions fall back to English for some
   entries**: `apps/web/src/i18n/tools/index.ts` has a catalogue
   that some tools/prompts/plugins have populated, others have
   not. The fallback returns the raw i18n key (e.g. `plugin.audit`)
   instead of the English description. Fix: when the i18n
   catalogue is missing the entry, fall back to the runtime
   English description in `capabilities.json`. Surface the gap
   in a "missing translations" report so the next sweep can
   fill it in.

## Plus

- **`/install` page still has a double title** (`<PageHeader><h1/>`
  + `Install.astro`'s inner `<h2>`). x00005 fixed the other 8
  section pages but missed this one. Same one-line change:
  drop `<PageHeader>` and pass `heading={t.install.title}` to
  `<Install>`.

## Why

The user has been running through the site and reporting each
friction point. Every one of these breaks the "polished docs
site" promise that the home page makes. None is a large
workstream; the changes are localised to a handful of files.

## Slices

### S1 — Strip `transition:name` from persist elements (bugs 1 + 6)
  - **Status**: ready
  - **Files**:
    `apps/web/src/components/SiteNav.astro` (remove
    `transition:name="site-nav"`, keep `transition:persist`),
    `apps/web/src/components/SiteFooter.astro` (same for
    `site-footer`),
    `apps/web/src/components/Config.astro` (remove
    `transition:name="cfg-modal"`),
    `apps/web/src/components/Search.astro` (remove
    `transition:name="search-modal"`),
    `apps/web/src/components/SiteNav.astro` (drawer — remove
    `transition:name="nav-drawer"`),
    `apps/web/src/styles/_view-transitions.scss` (drop the
    now-dead `::view-transition-old/new(site-nav)`,
    `(site-footer)`, `(cfg-modal)`, `(nav-drawer)` rules).
  - **Accept**: with `reduced-motion: no-preference`, the header
    and modals stay perfectly still across navigations and only
    the `<main>` content fades.

### S2 — Re-bind nav hrefs after every view transition (bug 2)
  - **Status**: ready
  - **Files**: `apps/web/src/components/SiteNav.astro` (add a
    script that runs on `astro:after-swap`, reads
    `document.documentElement.lang` and `location.pathname`,
    and rewrites every `<a>` inside `.nav__links` to point at
    the equivalent page in the current locale, falling back to
    `/<lang>/…` only when the equivalent page does not exist),
    `apps/web/src/components/SiteFooter.astro` (same pattern
    for `.sitefoot__col` anchors).
  - **Accept**: open the site at `/tools`, click the gear,
    switch to `/es/`, the **Tools** link in the nav now points
    at `/es/tools` (not `/tools`); click it, the page navigates
    in-place and the language sticks.

### S3 — Pin the search modal top (bug 3)
  - **Status**: ready
  - **Files**: `apps/web/src/styles/components/_modal.scss`
    (replace `top: 50%` + `transform: translateY(-50%)` with
    `top: 6vh; transform: none; max-height: 88vh;` so the
    panel is anchored to a fixed top offset and the bottom
    flexes).
  - **Accept**: typing in the search input does not move the
    panel — the top edge stays put regardless of result count.

### S4 — Replace the `<details>` "More" with a real popover (bug 4)
  - **Status**: ready
  - **Files**: `apps/web/src/components/SiteNav.astro` (drop
    the `<details>` wrapper, add `<button
    class="nav__more-trigger" aria-expanded="false"
    aria-controls="nav-more-panel">` and a sibling
    `<div class="nav__more-panel" id="nav-more-panel"
    role="menu" hidden>`, plus a `setupMore()` script that
    toggles `aria-expanded`, closes on outside click + Escape,
    and rotates the caret),
    `apps/web/src/styles/components/_nav.scss` (animate
    `transform: scaleY(0)→scaleY(1)` + `opacity: 0→1` on
    the panel, drive with `[aria-expanded="true"]` parent
    state and `prefers-reduced-motion` for instant open).
  - **Accept**: clicking "More" reveals the panel with a
    smooth animation; clicking outside, pressing Escape, or
    pressing the trigger again closes it; keyboard users can
    still tab through the menu items; `prefers-reduced-motion`
    users get an instant open/close.

### S5 — In-page language switch (bug 5)
  - **Status**: ready
  - **Files**: `apps/web/src/components/Config.astro` (the
    `hrefFor` helper currently always returns `/<lang>/…`;
    compute the new URL as follows: take the current
    `location.pathname`, strip the leading `/<lang>` prefix
    if present, then prepend the new `<lang>`. Edge case: if
    the current page is `/`, the new URL is `/<lang>/` (the
    locale home); if the current page is `/<lang>/`, the new
    URL is the equivalent in the new locale or `/` when the
    new locale is English).
  - **Accept**: switching from `/plugins` to Spanish lands on
    `/es/plugins`; switching from `/es/tools` to Japanese
    lands on `/ja/tools`; switching from `/tools` to English
    (already there) is a no-op.

### S6 — Catalogue-miss fallback + missing-translations report (bug 7)
  - **Status**: ready
  - **Files**:
    `apps/web/src/i18n/tools/index.ts` (change the lookup
    helpers `describeTool`, `describePrompt`, `describeResource`,
    `describeResourceName`, `describePromptArg` to **also
    accept a fallback description** and return it whenever the
    catalogue entry is missing; the component pass already
    supplies the English description from `capabilities.json`,
    so the wiring is one call-site update),
    `apps/web/src/components/PluginCapabilities.astro` and
    `apps/web/src/components/PluginsSection.astro` (use
    `t(\`plugin.${slug}\`)` with the new fallback — the
    catalogue check returns the English description from
    `capabilities.json` whenever the locale is missing),
    `apps/web/src/components/ToolsSection.astro` (same),
    `apps/web/scripts/missing-i18n-report.ts` (new — reads
    `capabilities.json` + walks the `i18n/tools/` catalogue,
    prints a Markdown table of every tool / prompt / resource
    / knowledge / plugin that has no entry in any of the 12
    locales, sorted by namespace).
  - **Accept**: no raw `plugin.<slug>` strings leak onto the
    site in any locale; the report script is runnable via
    `bun run report:missing-i18n` and produces a count + a
    table.

### S7 — Drop the `/install` double title (extra)
  - **Status**: ready
  - **Files**: `apps/web/src/pages/install.astro` (remove
    `<PageHeader title={t.install.title} />`, pass
    `heading={t.install.title}` to `<Install>`),
    `apps/web/src/pages/[lang]/install.astro` (same),
    `apps/web/src/components/Install.astro` (accept
    `heading?: string` prop, render `<h1>` instead of
    `<h2>`, fall back to `t.install.title`).
  - **Accept**: `/install` and `/<lang>/install` have exactly
    one `<h1>`.

## Non-goals

- Localising the audit messages, the proposed-tool descriptions,
  the live tool registry (capabilities.json) into the 12 locales.
  S6 only fixes the fallback; the actual translations are a
  separate workstream (S6 just produces the report).
- A SPA-style language toggle (no full page reload, just
  retranslate in place). S5 is "same page, new locale", not
  "stay on the same URL, swap all strings".

## Acceptance

- [ ] `bun run validate` is green.
- [ ] `bun run site:strict` builds.
- [ ] The 6 user-reported bugs all pass a manual smoke on the
      dev server.
- [ ] The `/install` page has exactly one `<h1>`.
- [ ] The missing-i18n report script runs and produces a list
      of every entry that still needs translation.

## risks and mitigations

- **R1 — S2 re-binds hrefs and could overwrite a user-set
  customisation**: we only rewrite `.nav__links a` and the
  footer anchors, never anything else.
- **R2 — S4 popover is keyboard-accessible but the trigger
  needs to keep the `<summary>` semantics**: we use `<button
  aria-haspopup="menu" aria-expanded>` and listen to
  `keydown` for `Escape` and `ArrowDown` to move focus into
  the panel.
- **R3 — S6 fallback could mask real translation gaps**: the
  missing-i18n report is the safety net; run it before every
  release.

## notes

- x00005 — the first round of web UI bugfixes (settings modal
  sync, themed scrollbar, etc.); the present proposal extends
  the same fix surface.
- `apps/web/src/i18n/tools/` — the catalogue that x00007 S6
  extends.
- `apps/web/src/i18n/langs/<code>.json` — the 12-locale strings
  for UI copy.
- `apps/web/src/data/manifests/capabilities.json` — the live
  tool registry (English source of truth for S6's fallback).
