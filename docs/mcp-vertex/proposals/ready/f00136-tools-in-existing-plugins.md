---
id: f00136
kind: feat
title: tools-in-existing-plugins — deps_audit/outdated/licenses, git_pr/bisect, quality_coverage/complexity, search_symbol/references, docs_generate
status: ready
date: 2026-07-23
track: plugin+tools+dx
---

# f00136 — tools in existing plugins

## goal

Add high-value tools **inside plugins that already exist and already load** —
no new-plugin ceremony, automatically covered by `verify:tools`/`catalog`:
`deps_audit` / `deps_outdated` / `deps_licenses` / `deps_tree` (deps),
`git_pr` / `git_bisect` / `git_stash` (git), `quality_coverage` /
`quality_complexity` (quality), `search_symbol` / `search_references`
(search), and `docs_generate` (docs). These are the cheapest high-value wins on
the roadmap.

## why

Each fills an obvious gap in a mature, already-loaded plugin, so the wiring
cost is near zero and the dogfooding payoff is immediate: dependency CVEs and
outdated/licenses on this repo, coverage + complexity hotspots on the ~5-minute
`validate`, symbol-accurate navigation, and generated docstrings/README.

## why this design

Extend the existing plugins in place; reuse r00012 for any external tool
(`bun audit`, license scan) and keep all decision logic pure. These are the
**light, built-in** versions; the comprehensive gated surfaces stay in the
dedicated opt-in plugins (`security` f00122, `refactor` f00123, `perf`
f00126) — `deps_audit` here is the quick check, `security` is the full,
baseline-gated scanner. This keeps the default surface useful without pulling
in heavy dependencies.

## non-goals

- No duplication of the dedicated plugins' depth (no gate/baseline here).
- No new plugin and no heavy/bundled external tools.
- No behaviour change to the existing tools in those plugins.

## slices

### S1 — deps tools

- **Status**: pending
- **Files**: `plugins/deps/src/lib/tools/deps-audit.tool.ts`, `plugins/deps/src/lib/audit/`
- **Gate**: bun run validate

`deps_audit` (CVEs via bun/npm audit through r00012), `deps_outdated`,
`deps_licenses`, `deps_tree`. Pure over the manifest + injected exec.

### S2 — git + quality tools

- **Status**: pending
- **Files**: `plugins/git/src/lib/tools/git-pr.tool.ts`, `plugins/quality/src/lib/tools/quality-coverage.tool.ts`
- **Gate**: bun run validate

`git_pr` (create/view via `gh` when present), `git_bisect`, `git_stash`;
`quality_coverage` (coverage report) and `quality_complexity` (cyclomatic
hotspots). Pure formatters over injected runners.

### S3 — search + docs tools

- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search-symbol.tool.ts`, `plugins/docs/src/lib/tools/docs-generate.tool.ts`
- **Gate**: bun run validate

`search_symbol` / `search_references` (symbol-accurate lookup), `docs_generate`
(docstrings/README from code). Pure over injected project.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `catalog:check`).
- `deps_audit` reports CVEs on this repo; `quality_coverage` returns a coverage
  summary; `search_symbol` finds a known symbol.
- No regression to existing tools in the touched plugins.

## notes

Reuses r00012 and each plugin's existing internals. The heavy counterparts are
f00122/f00123/f00126; these are the always-on light versions.
