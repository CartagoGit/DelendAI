---
id: v00153
title: "the MCP server answers initialize inside any client's connect window"
kind: perf
status: review
type: proposal
track: startup
date: 2026-11-01
last-transition-id: dfcd7ac2-6868-46cd-8e9f-185a021fb691
last-correlation-id: dfcd7ac2-6868-46cd-8e9f-185a021fb691
last-transition-from: in-progress
last-transition-at: 2026-11-01T17:12:24.662Z
---

# v00153 — the MCP server answers initialize inside any client's connect window

## goal

A client connecting to the server gets its answer in seconds on a repository with years of history, so an agent never loses the tools to a connect timeout.

## why

Claude Code gives a server 30 s to answer `initialize`, and on this repository the server took 39.7 s (measured 2026-11-01), so every session started without the DelendAI tools: `CONNECT_TIMEOUT`. A session with no tools has no skills, no routing and no selection, whatever else works.

The handshake waited for the whole start-up reconciliation, which ran 753 git processes and three network round trips. Most of them were one process per question: 388 `rev-parse` for stranded blobs, 178 `git status` for slices whose file list held a character only git can expand, and containment asked per checkpoint and ref. The directory walk added a realpath per file.

## non-goals

- Moving the reconciliation's checks elsewhere or skipping any of them: each still runs at every start.
- Shortening the network round trips, which depend on the forge.

## slices

- global_gate: type

### S1 — The client is answered first and the start asks git once
- **Status**: review
- **Files**: `packages/core/src/cli.ts`, `packages/core/src/lib/contracts/interfaces/delendai-project.interface.ts`, `packages/core/src/lib/filesystem/safe-workspace-reader.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `packages/core/tests/src/lib/project/tool-call-hold.helper.spec.ts`, `packages/core/src/lib/project/tool-call-hold.helper.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/src/lib/startup-reconciler/phases/held-by-any.helper.ts`, `packages/core/tests/src/lib/startup-reconciler/held-by-any.helper.spec.ts`, `plugins/commit-policy/src/lib/services/slice-persisted.service.ts`, `plugins/commit-policy/tests/src/lib/services/slice-persisted.service.spec.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "`initialize` is answered before the reconciliation runs: 39.7 s before this change, 1.8 s after, on this repository."
  - "A tool called during the start waits and then answers; it neither fails nor acts before the checkout is level."
  - "Containment over any number of checkpoints reads each set of tips once, and falls back to one question per pair when git cannot list them."
  - "A failed read of stranded blobs drops no stranded ref."
- shipped-in: `bc9e6fb6cf09`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `initialize` is answered before the reconciliation runs: 39.7 s before this change, 1.8 s after, on this repository.
- A tool called during the start waits and then answers; it neither fails nor acts before the checkout is level.
- Containment over any number of checkpoints reads each set of tips once, and falls back to one question per pair when git cannot list them.
- A failed read of stranded blobs drops no stranded ref.
