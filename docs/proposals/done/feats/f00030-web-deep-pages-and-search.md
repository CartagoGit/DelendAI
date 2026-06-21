---
id: f00030
status: done
type: proposal
track: web+docs
date: 2026-06-21
kind: feat
title: Web deep pages — per-tool pages, pagefind search, "first 5 minutes", troubleshooting
shipped-in: [ca2f2db, 94c4641]
ownership:
    - { agent: claude-orchestrator-round3, task: "S1 per-tool pages, S2 verify pagefind already wired, S3 first-5-minutes, S4 troubleshooting, S5 nav+audit close — closed" }
acceptance:
    - { command: "bun run --cwd apps/web check:i18n", expect: exit0 }
    - { command: "bun run site:strict", expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00030 — Web deep pages — per-tool pages, pagefind search, "first 5 minutes", troubleshooting

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

## why this design

- **S2 turned out to be a verification, not a build**: a prior round
  (unrelated proposal) had already wired `pagefind` end to end — the
  `Search.astro` modal, the `index:search` script, and the nav search
  button were all present and working before this proposal started. Rather
  than re-implementing or duplicating that work, S2 was re-scoped in place
  to "verify + extend coverage to the new pages" — confirmed by re-running
  `index:search` after S1/S3/S4 landed and seeing the page count grow from
  whatever it was before to 1574.
- **Real bug found and fixed while building S3**: `apps/web/src/i18n/shared.ts`'s
  `resolve()` deep-merge helper treated arrays as plain objects
  (`Object.keys([...])` yields numeric-string indices), silently turning
  `firstFiveMinutes.<profile>.steps` from an array into `{0: ..., 1: ...}`
  and breaking every `.map()` call site at runtime (`astro build` caught it
  immediately — `p.data.steps.map is not a function`). Fixed by special-
  casing `Array.isArray` before the generic object-merge branch. This bug
  was latent before this proposal (any future array-valued translation key
  would have hit it) — fixing it here, rather than working around it with a
  non-array shape, removes the landmine for every translation key added
  after this one.
- **No new `ToolCard.astro` component**: the proposal's S1 file list named
  a `ToolCard.astro`, but the existing card markup (`.tool.card` BEM block,
  already styled in `_tool.scss`/`_fx.scss`) was reused inline in
  `ToolsPluginIndex.astro` and `ToolsSection.astro` instead of extracting a
  new component — the markup is ~6 lines and used in exactly 2 places;
  extracting a component for that would be premature abstraction (YAGNI)
  given the existing `.tool.card` styling already does the job.
- **Troubleshooting cases are real, not placeholders**: each of the 6 cases
  traces to an actual session resume, audit finding, or fix proposal
  already in `docs/proposals/done/` (`n00006`, `a00013`/M2, `r00001`/`r00002`,
  `x00004`/B4, `docs/NPM_PUBLISH.md` §0.1) — cross-referenced via `closedBy`
  in each case's frontmatter so a reader can verify the claim against the
  actual fix.
- **`discoverTroubleshootingCases` deliberately mirrors `discoverTutorials`**:
  same pure-function + injected-reader shape (dependency inversion — the
  scanner takes an `ITroubleshootingReader` instead of importing `node:fs`
  directly), same per-file error isolation (a broken case file is skipped,
  not fatal), same test-fixture pattern. Two near-identical scanners
  instead of one generalised "markdown catalogue" abstraction was a
  deliberate SOLID trade-off: the two shapes (`ITutorial` vs.
  `ITroubleshootingCase`) already diverge (tutorials are keyed by
  plugin+lang, cases are keyed by a single global slug with no per-language
  variant), and forcing a shared abstraction now would couple two call
  sites that may evolve independently — premature generalisation, not
  premature optimization, but the same smell.

## Non-goals

- Migrating to MDX (Astro MDX is in the dev deps but we stay on `.astro` +
  `.md` for now — keeps the per-language build simple).
- Server-side search (pagefind is static; works on GitHub Pages).
- A blog or changelog-as-blog (the changelog is a single file, not a feed).

## Slices

### S1 — Per-tool pages (12 languages × N tools)
  - **Status**: done
  - **Files**: `apps/web/src/pages/tools/[plugin]/[tool].astro` (new),
    `apps/web/src/pages/tools/[plugin]/index.astro` (new),
    `apps/web/src/pages/[lang]/tools/[plugin]/[tool].astro` (new),
    `apps/web/src/pages/[lang]/tools/[plugin]/index.astro` (new),
    `apps/web/src/components/ToolPage.astro` (new — detail page),
    `apps/web/src/components/ToolsPluginIndex.astro` (new — per-plugin tool
    list), `apps/web/src/components/ToolsSection.astro` (modified — tool
    cards on `/tools` now link to their detail page),
    `apps/web/src/components/PluginPage.astro` (modified — the "tools" tab
    links each tool name to its detail page).
  - **Gate**: `bun run site:strict`
  - **Command**: `bun run site:strict`
  - **Result**: green; 76 tools × 12 locales = 912 per-tool pages, plus
    14 namespaces × 12 locales = 168 per-plugin tool-index pages.

### S2 — Pagefind index
  - **Status**: done (already implemented before this proposal — verified, not re-built)
  - **Files**: none changed — `apps/web/astro.config.mjs` did not need the
    `pagefind` integration (the project uses the standalone `pagefind` CLI
    via `index:search`, not the Astro integration), `apps/web/src/components/Search.astro`
    already existed with a full modal + dev fallback, and the search button
    was already wired into `SiteNav.astro` (`#search-open`).
  - **Gate**: `bun run --cwd apps/web index:search`
  - **Command**: `bun run --cwd apps/web index:search`
  - **Result**: green; indexed all 1574 pages × 12 languages, 31386 words.

### S3 — "First 5 minutes" page
  - **Status**: done
  - **Files**: `apps/web/src/pages/first-5-minutes.astro` (new),
    `apps/web/src/pages/[lang]/first-5-minutes.astro` (new — 12 locales),
    `apps/web/src/components/FirstFiveMinutesSection.astro` (new — 3-tab
    profile UI reusing `PluginTabs.astro`), `apps/web/src/i18n/shared.ts`
    (new `IFirstFiveMinutesTranslations` type), all 12
    `apps/web/src/i18n/langs/<code>.ts` (new `firstFiveMinutes` key).
  - **Gate**: `bun run --cwd apps/web check:i18n && bun run site:strict`
  - **Command**: `bun run --cwd apps/web check:i18n && bun run site:strict`
  - **Result**: green; page renders in 12 languages with 3 real profiles
    (Bun/Node, VS Code/Copilot, Claude Code).

### S4 — Troubleshooting page
  - **Status**: done
  - **Files**: `docs/troubleshooting/*.md` (6 new files — the canonical
    cases), `apps/web/scripts/lib/discover-troubleshooting.ts` (new — pure
    scanner, mirrors `discover-tutorials.ts`), `apps/web/scripts/__tests__/discover-troubleshooting.spec.ts`
    (new, 7 cases), `apps/web/scripts/gen-capabilities.ts` (modified —
    wires the scanner into `capabilities.json`), `apps/web/src/pages/troubleshooting/index.astro`,
    `apps/web/src/pages/troubleshooting/[slug].astro`,
    `apps/web/src/pages/[lang]/troubleshooting/index.astro`,
    `apps/web/src/pages/[lang]/troubleshooting/[slug].astro` (all new),
    `apps/web/src/components/TroubleshootingIndex.astro` + `TroubleshootingCase.astro` (new).
  - **Gate**: `bun run --cwd apps/web check:i18n && bun run site:strict`
  - **Command**: `bun run --cwd apps/web check:i18n && bun run site:strict`
  - **Result**: green; exactly the 6 canonical cases (npm token, docsDir
    misconfig, AGENT_SLOTS enum, auto_work idle, output validation, web
    base path), each with a real `closedBy` cross-link.

### S5 — Nav + audit close
  - **Status**: done
  - **Files**: `apps/web/src/components/SiteNav.astro` (modified — "First 5
    minutes" + "Troubleshooting" added to the `navCore`/"More" dropdown,
    same labels for the mobile drawer), `apps/web/src/layouts/Base.astro`
    (modified — the persisted-chrome runtime re-translation table gets the
    2 new nav keys for all 12 languages), `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
    (M27 flipped 🟡 → ✅, cross-linked to this file).
  - **Gate**: `bun run site:strict && bun run validate`
  - **Command**: `bun run site:strict && bun run validate`
  - **Result**: green; master audit M27 is ✅. `bun run validate`: 168 test
    files, 1246 tests passed.

## Acceptance

- [x] Every tool has a page (one per locale: 76 tools × 12 locales = 912 pages — more than the 68 estimated in the proposal text because the live registry grew between the proposal's drafting and this implementation).
- [x] Pagefind index exists and is wired to the nav search button (pre-existing; verified working end to end with the new pages included).
- [x] "First 5 minutes" page renders in 12 languages.
- [x] Troubleshooting page lists the 6 canonical cases with back-links to
      the proposal/session that closed each one.
- [x] Master audit M27 line is ✅.

## risks and mitigations

- **R1 — 816 new pages blow up the build time**: profile S1 first; if
  build > 90s, split by language (one build job per locale in CI).
- **R2 — Pagefind asset size**: cap the index to ≤ 1 MB by excluding
  `dist/pagefind/*.json` from the lighthouse check; not a build failure.

## notes

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 543).
- W3 requirements: same audit §7-bis (live annotations).
- `capabilities.json` generator: `scripts/gen-capabilities.ts` (or
  equivalent — `rg` to confirm the actual path).
- Existing i18n gate: `apps/web/scripts/check-i18n.ts`.
- Session summary: `docs/proposals/n00001-SESION-2026-06-17.md` (the
  source of the "canonical 6 cases" list).
