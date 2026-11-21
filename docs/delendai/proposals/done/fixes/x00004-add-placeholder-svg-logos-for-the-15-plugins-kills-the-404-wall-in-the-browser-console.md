---
id: x00004
status: done
type: proposal
track: web+ui
date: 2026-06-21
kind: fix
title: Add placeholder SVG logos for the 15 plugins (kills the 404 wall in the browser console)
shipped-in: 6a328c5, e1aa6f6
---

# x00008 — Missing plugin logos

## Goal

Stop the browser console from logging a 404 for every plugin
logo on every page that lists plugins. The `PluginsSection.astro`
and `PluginCapabilities.astro` components each render
`<img src="/logos/plugin-<slug>.svg">` for every plugin card.
`apps/web/public/logos/` did not exist (only `apps/web/public/{api,flags,logo.svg}`),
so the dev server returned a `[404] (Not Found)` for every card.

## Why

The 404s are visible noise in the browser console on every page
that mentions a plugin (the home, `/plugins`, `/capabilities`,
`/plugins/<slug>`, etc.) and break the "polished docs site"
promise the home page makes. A real product would have design
assets for each plugin, but those don't exist; the short-term fix
is a deterministic placeholder per plugin.

## Implementation

1. **`apps/web/scripts/gen-plugin-logos.ts`** (99 lines, new) —
   a tiny script that reads `capabilities.json`, computes a
   deterministic HSL hue per slug (djb2 hash modulo 360), and
   writes a 36×36 SVG to `apps/web/public/logos/plugin-<slug>.svg`
   with:
   - `<rect rx="8">` filled with the hue at `hsl(<hue> 55% 45%)`,
   - `<text>` with the slug's initials (up to 2 words, capitalised)
     centered at (18, 22), white, weight 700, font-size 14.
   The result is a per-plugin visual identity (15 unique hues +
   initials) within a tight palette so the family looks consistent.
2. **`apps/web/public/logos/`** (new, 15 SVGs + `.gitkeep`).
   Checked in so the dev server serves them without a generator
   round-trip; the script is idempotent and runnable manually if
   a new plugin is added.
3. **`apps/web/package.json`** — new `gen:logos` script, plus the
   `build` and `build:strict` commands now run
   `bun scripts/gen-plugin-logos.ts` after `gen:skills` so a
   fresh checkout regenerates the assets alongside the rest of
   the manifests.

## Acceptance

- [x] All 15 plugin logos return 200 from the dev server.
- [x] `bun run gen:logos` regenerates the 15 SVGs from
      `capabilities.json`.
- [x] `bun run build` and `bun run build:strict` both run
      `gen-plugin-logos` after the other generators.
- [x] No new `404` for `/logos/plugin-*.svg` in the browser
      console on `/`, `/plugins`, `/capabilities`, or
      `/plugins/<slug>`.

## Non-goals

- Replacing the placeholders with real plugin logos (these would
  have to be designed, then dropped in at the same path — the
  generator is now a no-op for those slugs because the SVGs are
  checked in).
- Adding `aria-hidden` to the placeholder images — the inline
  text element already has a `role="img"` + `aria-label` so
  screen readers say "audit plugin logo" instead of just the file
  name. The `alt=""` on the card icons stays (the plugin name
  is in the adjacent `<code>` block).

## notes

- `apps/web/src/components/PluginsSection.astro` and
  `apps/web/src/components/PluginCapabilities.astro` — the two
  consumers of `/logos/plugin-<slug>.svg`. The `onerror` handler
  on the card icons is kept as a safety net (a designer can drop
  a real logo at the same path and the script will skip it on
  the next `gen:logos` run only if the slug is removed from
  `capabilities.json`).
