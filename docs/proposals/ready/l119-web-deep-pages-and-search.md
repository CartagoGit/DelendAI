---
id: l119
status: ready
type: proposal
track: web+docs
date: 2026-06-21
kind: feat
title: Web deep pages — per-tool pages, pagefind search, "first 5 minutes", troubleshooting
---

# l119 — Web deep pages — per-tool pages, pagefind search, "first 5 minutes", troubleshooting

## Goal

Close the master audit's M27 follow-up (line 543) by extending the Astro
site (`apps/web`) from its current *"home + per-plugin pages"* shape to a
properly navigable **documentation surface**:

1. **One page per tool** with description (already i18n'd), parameters,
   effects, an example call, and a link back to the plugin page.
2. **Pagefind** static search across the whole site (no server required;
   GitHub-Pages-compatible).
3. **"First 5 minutes"** onboarding page — copy-pasteable quickstart for
   the three most common profiles (Bun/Node, VS Code/Copilot, Claude Code).
4. **Troubleshooting** page — matrix of "symptom → likely cause → fix" for
   the issues that have actually been reported (the session summaries list
   the canonical cases).

## Why

- The 3rd-party agnostic audit (Codex, 18-06) and the master audit both
  flag the same gap: the home is beautiful, the per-plugin pages are
  correct, but the site is **not yet browsable as documentation** — there
  is no way to find a tool by name, no onboarding flow, no
  troubleshooting entry point.
- All four pieces share the same data source (`capabilities.json` +
  `mcp-vertex.config.json` + a new `docs/troubleshooting/` folder) and the
  same build pipeline (Astro static + `bun run site`). One proposal, one
  workstream.

## Non-goals

- Migrating to MDX (Astro MDX is in the dev deps but we stay on `.astro` +
  `.md` for now — keeps the per-language build simple).
- Server-side search (pagefind is static; works on GitHub Pages).
- A blog or changelog-as-blog (the changelog is a single file, not a feed).

## Slices

### S1 — Per-tool pages (12 languages × N tools)
  - **Status**: ready
  - **Files**: `apps/web/src/pages/tools/[plugin]/[tool].astro` (new —
    dynamic route reading from `capabilities.json`; supports
    `getStaticPaths` for all 12 locales),
    `apps/web/src/pages/tools/[plugin]/index.astro` (new — lists tools in
    a plugin), `apps/web/src/components/ToolCard.astro` (new),
    `apps/web/src/i18n/tools/<locale>/<plugin>/<tool>.json` (the data
    already exists from M38 — no new translations needed).
  - **Command**: `bun run site:strict`
  - **Expect**: green; builds N×12 pages; lighthouse a11y ≥ 95.

### S2 — Pagefind index
  - **Status**: ready
  - **Files**: `apps/web/astro.config.mjs` (add `pagefind` integration),
    `apps/web/src/components/Search.astro` (new — search input that opens a
    modal with results from `/pagefind/pagefind.json`),
    `apps/web/src/layouts/Base.astro` (add the search button to the nav).
  - **Command**: `bun run site:strict`
  - **Expect**: green; `bun run site` produces a `dist/pagefind/` folder;
    a search for "metrics" or "swarm" returns the right tool page.

### S3 — "First 5 minutes" page
  - **Status**: ready
  - **Files**: `apps/web/src/pages/first-5-minutes.astro` (new),
    `apps/web/src/pages/[lang]/first-5-minutes.astro` (new — 12 locales),
    `apps/web/src/i18n/langs/<locale>/first-5-minutes.json` (new keys).
  - **Command**: `bun run check-i18n && bun run site:strict`
  - **Expect**: green; the page renders the same content in 12 languages.

### S4 — Troubleshooting page
  - **Status**: ready
  - **Files**: `docs/troubleshooting/` (new — one `.md` per case, frontmatter
    with `symptom`, `cause`, `fix`, `tags`), `apps/web/src/pages/troubleshooting/index.astro` (new — lists cases by tag),
    `apps/web/src/pages/troubleshooting/[slug].astro` (new — renders one case).
  - **Command**: `bun run check-i18n && bun run site:strict`
  - **Expect**: green; at least the 6 canonical cases are present (npm
    token, docsDir misconfig, AGENT_SLOTS enum, auto_work idle, output
    validation, web base path).

### S5 — Nav + audit close
  - **Status**: ready
  - **Files**: `apps/web/src/components/Nav.astro` (add Search, "First 5
    minutes", "Troubleshooting" links; same in 12 languages),
    `docs/proposals/audits/a1-16-06-2026-…md` (line 543 → `[x]`).
  - **Command**: `bun run site:strict && bun run validate`
  - **Expect**: green; master audit line 543 is `[x]`.

## Acceptance

- [ ] Every tool has a page (one per locale, total = 12 × 68 = 816 pages).
- [ ] Pagefind index exists and is wired to the nav search button.
- [ ] "First 5 minutes" page renders in 12 languages.
- [ ] Troubleshooting page lists the 6 canonical cases with back-links to
      the proposal that closed each one.
- [ ] Master audit line 543 is `[x]`.

## Risk register

- **R1 — 816 new pages blow up the build time**: profile S1 first; if
  build > 90s, split by language (one build job per locale in CI).
- **R2 — Pagefind asset size**: cap the index to ≤ 1 MB by excluding
  `dist/pagefind/*.json` from the lighthouse check; not a build failure.

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 543).
- W3 requirements: same audit §7-bis (live annotations).
- `capabilities.json` generator: `scripts/gen-capabilities.ts` (or
  equivalent — `rg` to confirm the actual path).
- Existing i18n gate: `apps/web/scripts/check-i18n.ts`.
- Session summary: `docs/proposals/RESUMEN-SESION-2026-06-17.md` (the
  source of the "canonical 6 cases" list).
