---
id: f00151
kind: feat
title: link-check plugin — offline markdown link + anchor integrity (link_check)
status: done
date: 2026-07-25
track: plugin+docs+quality
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - f00151 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass
---

# f00144 — link-check plugin

## goal

A `link-check` plugin that verifies markdown **relative links** and **anchor
integrity** across the workspace: `[text](target)` resolved against the
filesystem, and `#fragment` checked against real heading slugs (GitHub rules).
Reads markdown files, returns normalized `IFinding[]` (r00012) — fully offline,
external links are never fetched.

## why

The repo has had real incidents of broken doc links and stale anchors in
generated markdown (host-hint pages, scaffold outputs, audit briefs). A
fast, offline gate catches them before they reach the site build or
contributors — and complements the existing `link-check` script (lint:link-check)
by exposing the same logic as an MCP tool so agents can invoke it directly.

## why this design

Pure over an injected `ILinkScanDeps` (read markdown docs + every existing
repo path). Three checks per link: `broken-link` (high) — relative target
does not exist; `broken-anchor` (medium) — `#fragment` with no matching
heading; `empty-link` (low) — `[text]()` with no target. External
(http/mailto/…) links are classified but never fetched (offline-by-default).
Skips `node_modules`, `dist`, `build`, `.cache`, `.git`, `coverage`, `.astro`
to keep the scan budget-bounded. Anchor slugs follow GitHub: lowercased,
punctuation stripped, spaces hyphenated, duplicates get `-1`, `-2` …
suffixes; headings inside fenced code blocks are ignored.

## non-goals

- No external HTTP fetches — the check is offline by default.
- No markdown linting, formatting, or prose review — Biome owns that.
- No live site renderer — Astro's build pipeline is the canonical renderer.

## slices

### S1 — link-check plugin (full implementation)

- **Status**: done
- **Files**: `plugins/link-check/`
- **Gate**: bun run validate
- implementation:
  - `lib/contracts/interfaces/link-check.interface.ts` declares `ISourceDoc`, `IExtractedLink`, `IParsedTarget`, `ILinkScanDeps`, `ILinkCheckToolOptions` — narrow contracts per the types-in-contracts convention.
  - `lib/link-check/check-links.ts` is the pure analyzer: `slugify(heading)` (GitHub slug rules), `headingAnchors(content)` (with fence skipping + dup-suffixing), `extractLinks(content)` (links but not images, fence-respecting), `parseTarget(target)` (classifies into `external` / `anchor` / `relative` / `empty`), `checkLinks(docs, knownPaths)` (the orchestrator returning normalized `IFinding[]`).
  - `lib/link-check/real-deps.ts` is the only OS-touching module: `Bun.Glob('**/*.md')` under the workspace root, read each file up to 1 MiB, cap the scan at 5000 docs, build the `knownPaths` set with every ancestor directory so `./a.md` resolves even when `a.md` is a directory index.
  - `lib/tools/link-check.tool.ts` registers `link_check` with `tags: ['docs', 'quality']`, capped at 200 reported findings (the `total` count still surfaces the true number), composed via `sortFindings` / `summarizeFindings` / `worstSeverity` from r00012. Output: `{ docs, totalFindings, byRule, findings, summary, worst }`.
  - `src/index.ts` exports the plugin via `definePlugin({ name: 'link-check', version: '0.1.0' })` with the standard knowledge entry.
  - `src/public/index.ts` re-exports the pure checker primitives (`slugify`, `headingAnchors`, `extractLinks`, `parseTarget`, `checkLinks`, `realLinkScanDeps`) for plugin authors / tests.
  - Workspace plumbing: `tsconfig.base.json` paths, `vitest.shared.ts` aliases, `plugin-defaults.ts` (`'link-check': {}`), `release-plan.ts` publish order, `generate-tool-types.script.ts` harvester (PLUGIN_LIST + PLUGIN_SPECIFIERS), `bun.lock` symlink, regenerated `tool-outputs.ts` (`McpVertexLinkCheckLinkCheckOutput` interface).
  - 7 unit tests covering slugify punctuation handling, heading-anchor dedup with the `-1` suffix, fence-skipping in both anchors and links, link extraction (no images, escape-aware), `parseTarget` classification, and the full `checkLinks` end-to-end (broken-link + broken-anchor + empty-link + ignored external + clean repo).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- `link_check` on a fixture with a broken relative link, a stale anchor, and
  an empty `[text]()` returns one `IFinding` per defect with the documented
  severity band.
- No external HTTP fetches (a fixture with `https://example.com` is
  classified as `external` and ignored).
- The scanner is bounded: `>5000` docs or `>1MiB` files are skipped without
  crashing.

## notes

Prior art: `markdown-link-check`, `linkinator`, `remark-lint-no-broken-links`,
the project's own `lint:link-check` script. Pairs with the `docs` plugin
(f00050) for forward authoring checks. Distinct from `lint:link-check` —
the script is a CI gate over `./docs/**/*.md`; the plugin is a runtime tool
that the agent can invoke against any subtree.

## carry-over

The proposal exists retrospectively because the plugin and cherry-pick
(`9bc1a8c2`) landed first via a sibling agent branch (`agent/claude-link-check`).
This file documents the surface the plugin ships with so `lint:proposals`
and the `proposal-files-exist` baseline stay happy.
