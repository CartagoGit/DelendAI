---
id: x00964
title: "Context references and catalogues are keyed by what they contain"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00964 — Context references and catalogues are keyed by what they contain

## goal

A context delta references its payload once, expanding a hash-bearing reference checks the hash, the public catalogue cache is invalidated when its configured sources change, and configured clients are scoped to their project.

## why

gpt-6.1-sol's contribution to a00095. CTX-01: the delta reference embeds the full result twice. CTX-02: expanding a reference with contentHash accepts replaced content. CATALOG-01: the fresh catalogue cache ignores a change of configured sources. ACCOUNT-01: configured clients are global to the process and cross project boundaries.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: type

### S1 — context-compiler
- **Status**: pending
- **Files**: `packages/context-compiler/src/lib/tool-result-deltas.ts`, `packages/context-compiler/src/lib/context-manifest.ts`, `packages/context-compiler/src/lib/ref-expander.ts`, `packages/context-compiler/README.md`
- **Gate**: type
- acceptance:
  - "A delta carries a reference and no second copy (CTX-01)."
  - "Expansion verifies contentHash and refuses a mismatch (CTX-02)."

### S2 — Catalogue and clients
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/public-catalogue-sources.service.ts`, `packages/core/src/lib/shared/known-client.helper.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
- **Gate**: type
- acceptance:
  - "The cache key includes the source list (CATALOG-01)."
  - "Clients are resolved per workspace root (ACCOUNT-01)."

## acceptance

- A delta carries a reference and no second copy (CTX-01).
- Expansion verifies contentHash and refuses a mismatch (CTX-02).
- The cache key includes the source list (CATALOG-01).
- Clients are resolved per workspace root (ACCOUNT-01).
