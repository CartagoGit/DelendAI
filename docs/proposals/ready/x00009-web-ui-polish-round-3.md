---
id: x00009
status: ready
type: proposal
track: web+ui
date: 2026-06-21
kind: fix
title: Web UI polish round 3 — language swap transitions organically, header always updates, page format uniform, plugin icons with meaning, close settings modal on language change
---

# x126 — Web UI polish round 3 (post-x122, x124, x125)

## Goal

Close the third wave of user-reported polish bugs. Five bugs:

1. **Language swap reloads the page instead of transitioning**.
   Clicking a flag in the settings modal does navigate via the
   Astro ClientRouter, but the user perceives a full reload. The
   `<main transition:animate="fade">` runs, the settings modal
   is still open during the transition (so the modal sits on top
   of a fading background), and the `<astro:page-load>` handler
   re-fires the config setup which briefly re-opens / re-closes
   the modal. Fix: close the modal *before* the click triggers
   the navigation, and skip the modal's open animation in that
   one transition.
2. **The header (nav + footer) does not change on language
   swap — only on full reload**. The chrome is
   `transition:persist`-ed, so Astro replaces the inner HTML on
   `astro:after-swap`, but the `<SiteNav lang={lang} />` prop is
   only re-read on a full SSR pass. In some view transitions the
   client-side textContent is stale until the next full reload.
   Fix: belt-and-braces script in `Base.astro` that runs on
   `astro:after-swap` and re-renders the nav's `textContent`
   from a hard-coded 12-language map. The script is a safety net;
   the SSR re-render is the primary source.
3. **Several pages use a different format than the rest**.
   `/guide.astro`, `status/logs.astro`, `status/recovery.astro`
   and `plugins/loop-detector.astro` still use `<PageHeader>` to
   render a `<h1>`. The other 8 section pages (`/tools`,
   `/prompts`, `/capabilities`, `/install`, …) already migrated
   to the new pattern in x122 S3 (a single `<h1>` rendered by
   the section component, no `<PageHeader>`). This proposal
   migrates the four outliers so every page has exactly one
   `<h1>`, no `PageHeader` outside of `PluginPage.astro` (which
   keeps it for the breadcrumb).
4. **The plugin icons are just letters — they don't carry any
   meaning for what the plugin does**. The x125 placeholders
   (`plugin-audit.svg` is a magenta square with the letter "A")
   are deterministic and theme-agnostic but they don't help the
   user recognise the plugin at a glance. Fix: replace the
   letter glyphs with simple semantic icons — a magnifier for
   `audit`, a stack of layers for `core`, a tree for `git`, a
   gauge for `status-marker`, a chain link for `deps`, etc.
   The icons are still 36×36 SVGs in the same colour family
   (per-plugin hue + white foreground) so the visual identity
   carries over. Same generator, new glyphs.
5. **Missing translations for the nav (e.g. `Benchmarks`
   stays in English in `/es/`, `/fr/`, etc.)**. Some of the
   12 languages left a few `nav.*` keys in English because the
   term is technical. Fix: complete the translation table for
   the 9 nav keys (`install`, `tools`, `benchmarks`, `plugins`,
   `knowledge`, `prompts`, `resources`, `guide`, `more`) for
   the languages that left them in English. Same for the
   `footer.tagline` if it slipped.

## Why

The user is reviewing the site like a customer and reporting
every friction. The header-not-updating bug is the most
visible; the icon-meaning bug is the most jarring on first
impression; the format bug breaks the "polished docs site"
promise; the modal-on-top-of-fade bug looks unprofessional.

## Slices

### S1 — Settings modal closes itself on language change
  - **Files**: `apps/web/src/components/Config.astro`. The
    `lang-opt` click handler must `close()` the modal *before*
    the navigation triggers, so the user sees the language
    switch happen against the new page background, not a
    fade-in of the old page behind the open modal.
  - **Accept**: clicking a flag animates the modal out, then
    the page crossfades in the new locale. No "modal sits on
    fading background" frame.

### S2 — Belt-and-braces nav re-translate after view transition
  - **Files**: `apps/web/src/layouts/Base.astro` (add a script
    to the existing `astro:after-swap` block). Hard-code a
    `NAV_TEXTS[lang]` map of the 9 nav keys in the 12 locales
    and write a `refreshNavTexts()` that replaces the
    `textContent` of `.nav__link` and `.nav__more-link`
    elements based on their `data-nav-key` attribute. The
    `SiteNav` template emits `data-nav-key="install"` etc. on
    each anchor so the script can target the right element.
  - **Accept**: with any combination of locale + page, the
    nav labels are always in the active locale, no stale
    English text.

### S3 — Migrate the 4 outlier pages to the no-PageHeader pattern
  - **Files**:
    - `apps/web/src/pages/guide.astro` — drop `<PageHeader>`;
      the `<h1>` is already inside the article (move it out
      of the article so it sits as the page heading, not the
      section heading).
    - `apps/web/src/pages/status/logs.astro` — drop
      `<PageHeader>`, move the `<h1>` to the top of the
      section (or to a small `LogsHeader.astro` if the
      content is long).
    - `apps/web/src/pages/status/recovery.astro` — same.
    - `apps/web/src/pages/plugins/loop-detector.astro` — same
      (this one keeps the breadcrumb via a small inline
      pattern, not `<PageHeader>`).
  - **Accept**: `/guide`, `/status/logs`, `/status/recovery`
    and `/plugins/loop-detector` each render exactly one
    `<h1>`. `PluginPage.astro` is the only remaining consumer
    of `<PageHeader>` (it uses `crumbs`).

### S4 — Semantic icons for every plugin
  - **Files**:
    - `apps/web/scripts/gen-plugin-logos.ts` (replace the
      letter-text logic with a per-slug icon path; keep the
      hue-from-hash background and the white foreground).
    - Regenerate the 15 SVGs.
    - Optional: also generate IDE / package-manager icons
      (`/logos/npm.svg`, `/logos/pnpm.svg`, etc.) for the
      Install page. These are the second batch of 404s the
      console shows on `/install` and `/es/install`.
  - **Accept**: the user can glance at a plugin card and tell
    what it does (audit = magnifier, git = tree, etc.). The
    Install page no longer 404s on the 13 IDE / package
    manager icons.

### S5 — Complete the nav translation table
  - **Files**: `apps/web/src/i18n/langs/{it,fr,de,es,ja}.ts`
    — add the missing `nav.benchmarks`, `nav.knowledge`,
    `nav.prompts`, `nav.resources`, `nav.guide`, `nav.more`
    values in each language. (The `check-i18n.ts` script
    validates that every locale has every key, so a missing
    key is a CI error — but the check is a recent addition
    and the four outliers predate it.)
  - **Accept**: `bun run check:i18n` is green. In every
    locale, the nav reads in the active language end-to-end.

## Non-goals

- Replacing the per-plugin colour with a real brand
  palette. The 15 unique hues are still good enough for
  v1; a real brand can come in a later design pass.
- Localising the 60+ tool / prompt / resource descriptions
  (the catalogue has 60+ entries; this proposal is only
  about the 9 nav keys that are visible in the chrome).
- A SPA-style language toggle (in-place re-translate of the
  current URL). S2 only protects the persisted chrome from
  going stale.

## Acceptance

- [ ] `bun run validate` is green.
- [ ] `bun run site:strict` builds.
- [ ] All five user-reported bugs verified in the browser via
      Playwright on `/`, `/es/`, `/fr/`, `/de/`, `/install`,
      `/tools`, `/plugins`, `/plugins/audit`,
      `/status/logs`, `/status/recovery`, `/guide`,
      `/plugins/loop-detector`.
- [ ] The 13 missing IDE / package-manager logos on
      `/install` are now served (200 instead of 404).
- [ ] Every nav link reads in the active locale, no stale
      English text after a view transition.

## Risk register

- **R1 — S2 hard-coded map drifts from `i18n/langs/`**: the
  fix script lives in `Base.astro` (small), and the canonical
  source stays in the lang files. A `check-i18n` warning will
  surface any drift if the values diverge.
- **R2 — S4 icon paths are placeholder**: a future design
  pass can replace the icon string with a curated icon set
  (Heroicons, Lucide, etc.) without touching the layout or
  the generator. The current SVG paths are simple
  stroke-based shapes that read at 22×22 and 36×36.
- **R3 — S1 closing the modal before navigation can race the
  ClientRouter**: the click handler must `e.preventDefault()`,
  close the modal, then re-dispatch the click after the
  close animation (~200ms) so the router sees the
  navigation. Otherwise the navigation is cancelled.

## Linked references

- x122 — the first round of web UI bugfixes (settings modal
  sync, themed scrollbar, etc.).
- x124 — round 2 (header view transition, language
  persistence, search modal, More dropdown, in-page
  language switch, missing tool/plugin i18n).
- x125 — the placeholder logo generator and the
  15 SVGs it wrote to `apps/web/public/logos/`. S4 of this
  proposal extends that script to draw semantic icons
  instead of letter glyphs.
