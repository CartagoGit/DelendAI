---
id: f00125
kind: feat
title: browser plugin — Playwright-backed navigation, screenshots, DOM interaction, E2E assertions and accessibility scans
status: ready
date: 2026-07-23
track: plugin+browser+verification
---

# f00125 — browser plugin

## goal

A Playwright-backed `browser` plugin that gives agents the **visual and
runtime verification** they lack today: navigate, screenshot, query/inspect
the DOM, click/fill, assert E2E outcomes, run an **accessibility (axe)** scan,
and scrape — headless by default, `effects: ['network']`, auto-configured.
Aimed first at `apps/web` (the Astro site) and the VS Code extension webview.

## why

Playwright MCP is the **2nd most-adopted** MCP server; mcp-vertex agents cannot
visually verify rendered output at all. Dogfooding is concrete: the project
has a recorded incident where hundreds of generated tool/plugin pages shipped
with **no `<html>`/CSS/nav**; a browser tool lets an agent *prove* a page
renders correctly rather than trusting the generator.

## why this design

Wrap Playwright via r00012's presence probe + install hint (it is a heavy,
opt-in dependency). All page-action logic is a **pure planner over an injected
browser driver**, so tool logic is unit-tested without launching a real
browser; screenshots/artifacts land in `pluginCacheDir`; the network effect is
declared. Accessibility uses axe-core. Nothing is bundled — a missing browser
yields an install command, never a crash.

## non-goals

- No headful mass-scraping; no bundled Chromium unless installed on consent.
- No credential capture or form-autofill of secrets.
- No always-on browser process — launch per task, tear down after.

## slices

### S1 — navigation, screenshot, DOM query

- **Status**: pending
- **Files**: `plugins/browser/src/lib/page/`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
- **Gate**: bun run validate

`browser_open`, `browser_screenshot`, `browser_query` over an injected driver;
artifacts to `pluginCacheDir`. Missing Playwright → install hint.

### S2 — interaction + accessibility scan

- **Status**: pending
- **Files**: `plugins/browser/src/lib/interact/`, `plugins/browser/src/lib/tools/browser-a11y.tool.ts`
- **Gate**: bun run validate

`browser_click`/`browser_fill`/`browser_assert` and `browser_a11y` (axe) →
normalized `IFinding`s (r00012). Pure planners; injected driver in tests.

### S3 — E2E recipe + rendered-page verification + wiring

- **Status**: pending
- **Files**: `plugins/browser/src/lib/tools/browser-verify-page.tool.ts`, `plugins/browser/README.md`
- **Gate**: bun run validate

`browser_verify_page` asserts a URL renders with `<html>` + stylesheet + nav
(dogfoods `verify:site-pages`); an E2E recipe format; catalog + `web-app` pack
membership (r00011).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Screenshots the `apps/web` home page and returns axe findings on a fixture.
- `browser_verify_page` fails a CSS-less page and passes a correct one.
- Missing Playwright yields an install hint, never a crash.

## notes

Reuses r00012 (probe/finding). Prior art: Playwright MCP, Puppeteer, axe-core.
Pairs with `apps/web` and the extension webview for self-verification.
