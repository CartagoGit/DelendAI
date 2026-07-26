---
id: f00125
kind: feat
title: browser plugin — Playwright-backed navigation, screenshots, DOM interaction, E2E assertions and accessibility scans
status: done
date: 2026-07-23
track: plugin+browser+verification
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing f00125 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 321e55d8 # feat(f00125): S3 page verification + E2E recipe + wiring
  - 39ba92d1 # feat(f00125): S1 navigation + screenshot + DOM query
  - e1c50eaf # feat(f00125): S2 — browser interaction + accessibility tools
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

- **Status**: done
- **Files**: `plugins/browser/src/lib/page/`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `browser-inspect.tool.ts` exposes `browser_open`, `browser_screenshot`, `browser_query` over an injected `IBrowserDriver`.
  - Screenshots write atomically under `pluginCacheDir/browser/<timestamp>.png`.
  - Missing Playwright → `status: 'install-missing'` plus a `bun add -D playwright && npx playwright install chromium` hint, never a crash.
  - 20/20 plugin tests pass.

### S2 — interaction + accessibility scan

- **Status**: done
- **Files**: `plugins/browser/src/lib/interact/`, `plugins/browser/src/lib/tools/browser-a11y.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `iaction-driver.ts` adds `IBrowserActionDriver` (click/fill/assert/runAxe) and a
    `IFullBrowserDriver` composite; re-uses the S1 `IBrowserDriver` interface from
    `lib/page/ibrowser-driver.ts` so production drivers implement both halves.
  - `axe-mapper.ts` normalizes axe-core results to r00012 `IFinding[]` (one finding
    per affected node, axe impact → scanner-standard severity, `file` is the
    collapsed element HTML so the CLI/extension renderers show a precise location).
  - `assertions.ts` converts failed `IAssertOutcome`s to `IFinding[]` (passes are
    pass-through — no noise on success).
  - `browser-a11y.tool.ts` registers four tools:
      - `browser_click`, `browser_fill` → `IInteractionResult`
      - `browser_assert` → `IFinding[]` (empty = all passed)
      - `browser_a11y` → `IFinding[]` + per-severity summary + worst band
  - Every tool probes Playwright when no driver is injected and returns a
    structured `installHint` error instead of crashing.
  - 10 unit tests (FakeServer + driver mocks); all 4 browser test files pass
    (20 tests total: S1 + S2 + probe + page-planner).
  - `plugins/browser/src/index.ts` wires S1 + S2 with a split driver (inspect
    half vs interact half) and `plugins/browser/src/public/index.ts` re-exports
    the S2 surface for plugin-authors/tests.

### S3 — E2E recipe + rendered-page verification + wiring

- **Status**: done
- **Files**: `plugins/browser/src/lib/tools/browser-verify-page.tool.ts`, `plugins/browser/README.md`, `plugins/browser/src/lib/tools/browser-verify-page.tool.spec.ts`
- **Gate**: bun run validate
- implementation:
  - `browser-verify-page.tool.ts` exposes `browser_verify_page` with `mode: real | fixture`.
  - When `fixture` is provided, the tool checks the in-memory strings (`<html>`, stylesheet, nav).
  - When `fixture` is absent, the tool fetches the URL via the injected `IBrowserDriver` and asserts the rendered DOM.
  - Missing Playwright → `ok: false` with `installHint` populated (never a crash).
  - Wired into `plugins/browser/src/index.ts` and exported in `plugins/browser/src/public/index.ts`.
  - `plugins/browser/README.md` documents usage, install, modes, and the E2E recipe shape.
  - 24/24 plugin tests pass.

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
