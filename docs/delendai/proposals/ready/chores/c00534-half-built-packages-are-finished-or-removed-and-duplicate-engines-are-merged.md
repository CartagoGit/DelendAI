---
id: c00534
title: "Half-built packages are finished or removed, and duplicate engines are merged"
kind: chore
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# c00534 — Half-built packages are finished or removed, and duplicate engines are merged

## goal

roadmap-sqlite and state-sqlite are wired or removed, the SQLite loader exists once, every package has a build target and a README, the Go shim tests compile, the legacy rules builder has a removal date, github and gitlab share one engine, one authority reads PRs and issues, the resolver's terminal reasons are all handled, and no source string contains a NUL byte.

## why

Joint audit a00095. G6: half-done or undocumented packages (roadmap-sqlite, packages without README). G59: packages/roadmap-sqlite is orphan code. G73: @delendai/state-sqlite is its orphan twin (3,268 LOC, 8 specs). G24: the multi-runtime SQLite loader exists three times. G39: @delendai/test-kit has no build target. G7: the Go shim tests call findCLIEntryFrom, which main.go does not define. G13: the legacy rules builder lives on with no end date. G10: structural duplication between github and gitlab. G106: two authorities read PRs and four read issues. G60/D38: a physical NUL byte inside the review-diff prompt. sol ORCH-06: the bootstrap denies dist mirrors the builder creates. D9: the resolver has 7 terminal reasons, two unhandled.

## non-goals

- Behaviour changes of the merged engines beyond what their specs fix.

## slices

- global_gate: type

### S1 — Orphan packages and loaders
- **Status**: pending
- **Files**: `packages/roadmap-sqlite/package.json`, `packages/state-sqlite/package.json`, `packages/state-telemetry/src/lib/eta/duration-history.ts`, `packages/test-kit/package.json`, `packages/ui-extension/package.json`, `tools/scripts/compile/build.script.ts`
- **Gate**: type
- acceptance:
  - "roadmap-sqlite and state-sqlite are either loaded by a plugin with a spec proving it, or deleted with their references (G59, G73, G6)."
  - "One SQLite loader is imported by every user (G24)."
  - "Every package has build and README (G39, G6)."

### S2 — Shim, prompts and bootstrap
- **Status**: pending
- **Files**: `bin/delendai-shim/main_test.go`, `plugins/prompts-pack/src/prompts/review-diff.ts`, `plugins/prompts-pack/src/prompts/prompts.spec.ts`, `packages/core/src/lib/wip-engine/patch-digest.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "go test passes in bin/delendai-shim (G7)."
  - "No NUL byte in prompts; a spec asserts it (G60, D38)."
  - "The bootstrap describes the dist mirrors the builder makes (ORCH-06)."

### S3 — Duplicate engines
- **Status**: pending
- **Files**: `plugins/rules/src/lib/frameworks/manifest.ts`, `plugins/gitlab/src/lib/tools/shared.ts`, `plugins/github/src/lib/client.ts`, `plugins/forge/src/index.ts`, `plugins/git/src/lib/tools/forge-tools.ts`, `packages/core/src/lib/dispatch/capability-resolver.error.ts`
- **Gate**: type
- acceptance:
  - "The legacy rules builder is removed or carries a dated deprecation (G13)."
  - "github and gitlab share a forge engine for their common shapes (G10)."
  - "forge is the one PR/issue reader; git's forge tools delegate to it (G106)."
  - "Every resolver terminal reason has a handled branch and a spec (D9)."

## acceptance

- roadmap-sqlite and state-sqlite are either loaded by a plugin with a spec proving it, or deleted with their references (G59, G73, G6).
- One SQLite loader is imported by every user (G24).
- Every package has build and README (G39, G6).
- go test passes in bin/delendai-shim (G7).
- No NUL byte in prompts; a spec asserts it (G60, D38).
- The bootstrap describes the dist mirrors the builder makes (ORCH-06).
- The legacy rules builder is removed or carries a dated deprecation (G13).
- github and gitlab share a forge engine for their common shapes (G10).
- forge is the one PR/issue reader; git's forge tools delegate to it (G106).
- Every resolver terminal reason has a handled branch and a spec (D9).
