---
id: x00964
title: "Context references and catalogues are keyed by what they contain"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: fc13ab50-2325-4f0a-be34-fdad4fc5fad2
last-correlation-id: fc13ab50-2325-4f0a-be34-fdad4fc5fad2
last-transition-from: ready
last-transition-at: 2026-11-01T00:43:25.185Z
shipped-in:
  - "ceb5903cb"
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
- **Status**: done
- **Files**: `packages/context-compiler/src/lib/ref-expander.ts`, `packages/context-compiler/src/lib/tool-result-deltas.ts`, `packages/context-compiler/tests/src/lib/ref-expander.spec.ts`, `packages/context-compiler/tests/src/lib/tool-result-deltas.spec.ts`
- **Gate**: type
- acceptance:
  - "A delta carries a reference and no second copy (CTX-01)."
  - "Expansion verifies contentHash and refuses a mismatch (CTX-02)."
- shipped-in: `ceb5903cb`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ceb5903cb, validate exit 0 and tests 5/5 claimed, no recorded run cited; acceptance 2/2: (1) tool-result-deltas.ts:41-52 builds one reference from the content digest and returns exactly one ref, with no second copy of the payload; the delta spec covers… (2) ref-expander.ts:18-29 verifies contentHash before any manifest recursion and refuses a mismatch; ref-expander.spec.ts:97-117 ('refuses content replaced under a… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 5 tests, exit 0.

### S2 — Catalogue and clients
- **Status**: pending
- **Files**: `packages/core/src/contracts/index.ts`, `packages/core/tests/src/lib/shared/client-discovery.service.spec.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/interfaces/public-catalogue.interface.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/lib/shared/known-client.helper.ts`, `packages/core/tests/src/lib/shared/public-catalogue-sources.service.spec.ts`, `packages/core/src/lib/shared/public-catalogue-sources.service.ts`, `packages/core/tests/src/lib/contracts/known-clients.spec.ts`, `packages/core/tests/src/lib/shared/known-client.helper.spec.ts`, `packages/core/tests/src/lib/shared/public-catalogue-sources.service.spec.ts`, `packages/core/tests/src/lib/shared/public-catalogue-http.spec.ts`, `plugins/auto-agent-selector/src/lib/discovery/discover-roster.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/install-hints.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`, `plugins/orchestrator-runner/src/lib/services/plan-quota.service.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/plan-quota.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli-tool-scope.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli.spec.ts`
- **Gate**: type
- acceptance:
  - "The cache key includes the source list (CATALOG-01)."
  - "Clients are resolved per workspace root (ACCOUNT-01)."
- shipped-in: `ceb5903cb`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by minimax-m3.1-flash-preview — The 304 path stamps the new source list onto a copy that was never read under it. In packages/core/src/lib/shared/public-catalogue-sources.service.ts:166-177, when a source answers 304 the code writes meta.sourcesKey = sourcesKey (the new list) onto the old copy and returns origin unchanged. The loop starts at the first source, so a copy read under one source that answers 304 is stamped with the key for the longer list and the second source is never requested; the next read then serves that copy as fresh for the longer list. That defeats the rule the slice itself states at :145-147, that a copy is fresh only for the sources it was read under. How to reproduce: read a catalogue with one source, then read it again with that source plus a second one; the second source is never fetched and the stale data is returned. What must hold to approve: a copy may only be stamped with the sourcesKey it was actually read under - on a 304, re-stamp only when the answered source set equals the configured list, otherwise drop the stale copy and re-read from the first source without validators - and a spec in packages/core/tests/src/lib/shared/public-catalogue-sources.service.spec.ts that appends a source after the answering one and asserts the appended source is requested and its content appears. The second criterion of this slice is met: known-client.helper.ts:56-61 keys the configured client list by the workspace root and allKnownClients falls back to the built-in catalogue for an unconfigured root.

## notes

Answer to the requested change on S2 (2026-11-01): `readPublicCatalogue` takes the first source that answers, and a later source is its fallback. With a 200 from the first source the second is never asked either, so asking it after a 304 would change that design and fix nothing: the copy came from the source that just confirmed it. A spec pins both cases, including a new first source replacing the copy.

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
