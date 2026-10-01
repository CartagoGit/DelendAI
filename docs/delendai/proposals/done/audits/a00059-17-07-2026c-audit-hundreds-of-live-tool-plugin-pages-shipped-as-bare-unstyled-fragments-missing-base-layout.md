---
id: a00059
title: "17-07-2026c audit — hundreds of live tool/plugin pages shipped as bare unstyled fragments (missing Base layout)"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 2 commits referencing a00059 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 2-commit batch
shipped-in:
  - f7238422 # fix(cli): a00060 — mcpv doctor was silent by default and always reported 0 tools
  - 06e5720d # fix(web): a00059 — 937 tool/plugin detail pages shipped as bare unstyled fragmen
---

# a00059 — 17-07-2026c claude-round-2 audit — hundreds of live tool/plugin pages shipped as bare unstyled fragments (missing Base layout)

## Goal

Continuing the "actually run it and look" theme from a00058, ran `bun run site` for real (not just `lint:web`/astro check, which only type-checks) and noticed Pagefind silently logging "has no <html> element" 937 times during indexing. Traced it: three page routes — `apps/web/src/pages/tools/[plugin]/[tool].astro`, `apps/web/src/pages/[lang]/tools/[plugin]/[tool].astro`, and `apps/web/src/pages/plugins/[plugin].astro` — rendered their body component (`ToolPage`/`PluginPage`) directly, with no `<Base lang=...>` wrapper, unlike every sibling route (which either imports `Base` directly or uses `PageShell`, which wraps `Base` internally — confirmed by auditing every `.astro` page under `apps/web/src/pages` for a Base/PageShell wrapper). The built output for `/tools/git/mcp-vertex_git_status/` was a 1092-byte fragment: `<!doctype html><header>...</section>` — no `<html>`, `<head>`, meta tags, CSS, or site navigation. This affected every one of the 76 tools × 12 languages (912 pages) plus all 25 plugin detail pages (English variant; the localized `[lang]/plugins/[plugin].astro` route already wrapped correctly) — visitors to any tool or plugin detail page on the live site would see raw unstyled text with zero navigation back into the site, and search indexing silently degraded for all of them. Fixed by wrapping all three routes in `<Base lang={...}>`, matching the working sibling pattern. Built a permanent `verify:site-pages` gate (wired into the `site` script itself, run right after the astro build) that walks every built `.html` file and fails loudly if any lacks a real `<html` document root — this exact regression can never ship silently again.

## why

User directive: keep pushing every dimension to 11/10. This continues directly from a00058: `bun run dev:ide`/`dev:vscode` were broken (fixed), and now the SAME root discipline — actually run the artifact and look at real output, not just trust type-checking — found that `bun run site`'s own build output silently shipped hundreds of malformed pages that no existing gate (astro check, lint:style-integrity, lint:content-integrity) catches, because none of them inspect built HTML output for structural completeness.

## non-goals

- No attempt to make astro `check` itself catch this — it type-checks .astro source, it fundamentally cannot see missing-layout regressions that only manifest in the rendered output.
- No change to PageShell/Base's own implementation — the bug was 3 call sites forgetting to use either, not a defect in the layout components themselves.

## Slices

- global_gate: e2e

### S1 — Fix the 3 unwrapped routes + add a permanent verify:site-pages gate
- **Status**: done
- **Files**: `apps/web/src/pages/tools/[plugin]/[tool].astro`, `apps/web/src/pages/[lang]/tools/[plugin]/[tool].astro`, `apps/web/src/pages/plugins/[plugin].astro`, `tools/scripts/verify/site-pages-verify.script.ts`, `package.json`
- **Gate**: e2e
- acceptance:
  - "Audited every .astro page under apps/web/src/pages for a Base/PageShell wrapper; confirmed exactly 3 routes were missing one, all others (20+) already correctly wrap via PageShell or a direct <Base> import."
  - "All 3 routes now wrap their body component in <Base lang={...}>, matching the working [lang]/plugins/[plugin].astro sibling pattern."
  - "verifySitePages(buildDirAbs) walks every built .html file and fails if any lacks a real <html> root; confirmed it catches the regression (manually corrupted one built page, re-ran, got a clean fail; restored, re-ran, clean pass)."
  - "Wired into package.json's site script (runs right after the astro build) and exposed standalone as verify:site-pages."
  - "bun run site end-to-end: 0 Pagefind "has no <html> element" warnings (was 937), verify:site-pages reports 2264/2264 clean. bun run typecheck clean."

## acceptance

- Audited every .astro page under apps/web/src/pages for a Base/PageShell wrapper; confirmed exactly 3 routes were missing one, all others (20+) already correctly wrap via PageShell or a direct <Base> import.
- All 3 routes now wrap their body component in <Base lang={...}>, matching the working [lang]/plugins/[plugin].astro sibling pattern.
- verifySitePages(buildDirAbs) walks every built .html file and fails if any lacks a real <html> root; confirmed it catches the regression (manually corrupted one built page, re-ran, got a clean fail; restored, re-ran, clean pass).
- Wired into package.json's site script (runs right after the astro build) and exposed standalone as verify:site-pages.
- bun run site end-to-end: 0 Pagefind "has no <html> element" warnings (was 937), verify:site-pages reports 2264/2264 clean. bun run typecheck clean.

## Verified State

| Verification | Value |
|---|---|
| Repro (before fix) | `bun run site` → Pagefind logs `"/tools/git/mcp-vertex_git_status/" has no <html> element` × 937 (76 tools × 12 langs = 912, + 25 English-only plugin pages) |
| Sample built page (before fix) | `build/apps/web/tools/git/mcp-vertex_git_status/index.html` — 1092 bytes, `<!doctype html><header>...</section>`, no `<html>`/`<head>`/`<body>`, no CSS, no site nav |
| Route audit | Every `.astro` page under `apps/web/src/pages` checked for a `Base`/`PageShell` wrapper; exactly 3 routes had neither (`tools/[plugin]/[tool].astro`, `[lang]/tools/[plugin]/[tool].astro`, `plugins/[plugin].astro`); the sibling `[lang]/plugins/[plugin].astro` already wrapped correctly, which is why only the English plugin-detail variant was affected |
| Sample built page (after fix) | same file — 35 483 bytes, real `<html>` document with full site chrome |
| `verify:site-pages` (after fix) | `✓ site-pages-verify: 2264 built pages all have a real <html> document root.` |
| Regression check | manually corrupted the built page back to a bare fragment, re-ran `verify:site-pages` → `✖ ... 1/2264 built page(s) are missing an <html> root`; restored, re-ran → clean |
| `bun run site` (after fix, full pipeline incl. new gate) | 0 Pagefind "has no `<html>` element" warnings, `verify:site-pages` step passes, exit 0 |
| `bun run typecheck` | clean (0 errors) |

## Findings

### 1. Every tool/plugin detail page shipped without the site layout (P0 · broken UX + SEO + search)
**File**: [`apps/web/src/pages/tools/[plugin]/[tool].astro`](apps/web/src/pages/tools/%5Bplugin%5D/%5Btool%5D.astro), [`apps/web/src/pages/[lang]/tools/[plugin]/[tool].astro`](apps/web/src/pages/%5Blang%5D/tools/%5Bplugin%5D/%5Btool%5D.astro), [`apps/web/src/pages/plugins/[plugin].astro`](apps/web/src/pages/plugins/%5Bplugin%5D.astro).
**Impact**: 912 tool-detail pages (76 tools × 12 languages) and 25 English plugin-detail pages rendered as bare, unstyled content fragments with no `<html>`/`<head>`/`<body>`, no CSS, no site navigation, no meta tags — a visitor landing on any of these (very plausibly via search-engine results, since they're deep content pages) would see raw text with no way back into the site except one manual link, and no styling at all. Pagefind's search index quietly degraded for the same set of pages. No existing gate caught this: `astro check` only type-checks source, `lint:style-integrity`/`lint:content-integrity` scan source-level class usage, not rendered output structure.
**Resolution**: [RESUELTO] — all 3 routes now wrap their body component in `<Base lang={...}>`, matching the working sibling pattern (`[lang]/plugins/[plugin].astro`, and every other page via `PageShell`). New `verify:site-pages` gate wired into the `site` script closes the detection gap permanently.

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| Tool/plugin detail pages with a real site layout | 0 / 937 (0%) | 937 / 937 (100%) |
| Pagefind "has no `<html>` element" warnings | 937 | 0 |
| Standing regression gate for this class of bug | none | `verify:site-pages`, part of `bun run site` |
| Overall (delta on top of a00057/a00058's audits) | — | this finding closed; no other findings opened this pass |
