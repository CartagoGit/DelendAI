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

- New context-compiler features.

## slices

- global_gate: type

### S1 — context-compiler
- **Status**: pending
- **Files**: `packages/context-compiler/src/lib/ref-expander.ts`, `packages/context-compiler/src/lib/tool-result-deltas.ts`, `packages/context-compiler/tests/src/lib/ref-expander.spec.ts`, `packages/context-compiler/tests/src/lib/tool-result-deltas.spec.ts`
- **Gate**: type
- acceptance:
  - "A delta carries a reference and no second copy (CTX-01)."
  - "Expansion verifies contentHash and refuses a mismatch (CTX-02)."

### S2 — Catalogue and clients
- **Status**: pending
- **Files**: `packages/core/src/contracts/index.ts`, `packages/core/tests/src/lib/shared/client-discovery.service.spec.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/interfaces/public-catalogue.interface.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/lib/shared/known-client.helper.ts`, `packages/core/src/lib/shared/public-catalogue-sources.service.ts`, `packages/core/tests/src/lib/contracts/known-clients.spec.ts`, `packages/core/tests/src/lib/shared/known-client.helper.spec.ts`, `packages/core/tests/src/lib/shared/public-catalogue-sources.service.spec.ts`, `packages/core/tests/src/lib/shared/public-catalogue-http.spec.ts`, `plugins/auto-agent-selector/src/lib/discovery/discover-roster.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/install-hints.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`, `plugins/orchestrator-runner/src/lib/services/plan-quota.service.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/plan-quota.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli-tool-scope.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli.spec.ts`
- **Gate**: type
- acceptance:
  - "The cache key includes the source list (CATALOG-01)."
  - "Clients are resolved per workspace root (ACCOUNT-01)."

## acceptance

- A delta carries a reference and no second copy (CTX-01).
- Expansion verifies contentHash and refuses a mismatch (CTX-02).
- The cache key includes the source list (CATALOG-01).
- Clients are resolved per workspace root (ACCOUNT-01).

## notes

- CTX-01: the duplication came from the artifact key, whose id was the result's JSON and travelled inside the ref; the key is now a sha256 of it, and the `fullContent` copy of the ref is removed.
- CTX-02: the hash is checked by the expander, not by every record load: the manifest diff loads records by refs whose hash it compares on purpose.
- ACCOUNT-01: `knownClientOf` and `allKnownClients` take the workspace root; a root nobody configured gets the built-in catalogue. Install hints read `catalogueClientOf`, since a declared client keeps its command's built-in install.
- The README describes neither the delta shape nor the expansion check in detail, so it is unchanged.
