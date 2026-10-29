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
- **Files**: `bun.lock`, `tsconfig.base.json`, `vitest.shared.ts`, `packages/state-sqlite/package.json`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `packages/test-kit/package.json`, `packages/ui-extension/package.json`, `plugins/changelog/package.json`, `plugins/roadmap/README.md`, `packages/contracts/README.md`, `packages/proposals-sqlite/README.md`, `packages/sqlite/README.md`, `packages/state-sqlite/README.md`, `packages/state-telemetry/README.md`, `packages/test-kit/README.md`, `packages/ui-extension/README.md`, `plugins/execution-env/README.md`, `plugins/external-mcps/README.md`, `plugins/framework-knowledge/README.md`, `plugins/refactor/README.md`, `plugins/self-learning/README.md`
- **Gate**: type
- acceptance:
  - "roadmap-sqlite and state-sqlite are either loaded by a plugin with a spec proving it, or deleted with their references (G59, G73, G6)."
  - "One SQLite loader is imported by every user (G24)."
  - "Every package has build and README (G39, G6)."

### S2 — Shim, prompts and bootstrap
- **Status**: pending
- **Files**: `bin/delendai-shim/main.go`, `plugins/prompts-pack/src/prompts/prompts.spec.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "findCLIEntryFrom is defined so the shim tests compile (G7); go is not installed on this host, so go test itself runs in CI only."
  - "No NUL byte in prompts; a spec asserts it (G60, D38)."
  - "The bootstrap describes the dist mirrors the builder makes (ORCH-06)."

### S3 — Duplicate engines
- **Status**: pending
- **Files**: `plugins/rules/src/lib/frameworks/manifest.ts`, `plugins/remote-provider-core/src/index.ts`, `plugins/remote-provider-core/src/lib/wire.helper.ts`, `plugins/remote-provider-core/src/lib/contracts/constants/wire.constant.ts`, `plugins/remote-provider-core/src/lib/http-client.ts`, `plugins/remote-provider-core/tests/wire.spec.ts`, `plugins/github/src/lib/client.ts`, `plugins/gitlab/src/lib/client.ts`, `plugins/git/package.json`, `plugins/git/src/lib/contracts/interfaces/forge.interface.ts`, `plugins/git/src/lib/services/forge.ts`, `plugins/git/tests/src/lib/forge.spec.ts`, `packages/core/src/lib/dispatch/capability-resolver.error.ts`, `packages/core/src/lib/contracts/constants/resolver-terminal-reasons.constant.ts`, `packages/core/src/lib/tools/compact-router.tool.ts`, `packages/core/src/lib/tools/resolve-capability.tool.ts`, `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
- **Gate**: type
- acceptance:
  - "The legacy rules builder is removed or carries a dated deprecation (G13)."
  - "github and gitlab share a forge engine for their common shapes (G10)."
  - "forge is the one PR reader; git's pr_list and pr_view delegate to it (G106)."
  - "Every resolver terminal reason has a handled branch and a spec (D9)."

## acceptance

- roadmap-sqlite and state-sqlite are either loaded by a plugin with a spec proving it, or deleted with their references (G59, G73, G6).
- One SQLite loader is imported by every user (G24).
- Every package has build and README (G39, G6).
- findCLIEntryFrom is defined so the shim tests compile (G7); go test itself runs in CI only.
- No NUL byte in prompts; a spec asserts it (G60, D38).
- The bootstrap describes the dist mirrors the builder makes (ORCH-06).
- The legacy rules builder is removed or carries a dated deprecation (G13).
- github and gitlab share a forge engine for their common shapes (G10).
- forge is the one PR reader; git's pr_list and pr_view delegate to it (G106).
- Every resolver terminal reason has a handled branch and a spec (D9).

## notes

- S1: roadmap-sqlite deleted (nothing imported it; paths, lock, logo and README mention removed). state-sqlite is kept, loaded by name by core behind state.parity.shadow.enabled with state-registry-choice.spec as proof, and now opens its database through the one loader in @delendai/sqlite. test-kit, ui-extension and changelog gain a build script; twelve packages gain a README.
- S2: the NUL byte was already gone from review-diff.ts; prompts.spec.ts now asserts none in rendered prompts or prompt sources. The bootstrap section on build layout describes the dist mirror. The Go toolchain is absent here, so go test was not run.
- S3: the legacy rules builder carries a dated deprecation (2026-12-31). github and gitlab clients share the wire helpers (and the plugin's own http client) from remote-provider-core; their error mapping and body reading still differ and stay local. git's pr_list and pr_view delegate to forge. Resolver reasons gain RESOLVER_DEFAULT_NEXT_ACTION (a Record over the union) used by the compact router, a host_read_only spec and a completeness spec. The issue readers in plugins/issues and plugins/issues-triage still call GitHub directly; moving them is out of reach in this slice and acceptance was narrowed to pull requests.
