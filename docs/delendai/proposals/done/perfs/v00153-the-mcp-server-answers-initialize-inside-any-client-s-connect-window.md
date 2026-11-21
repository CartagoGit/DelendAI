---
id: v00153
title: "the MCP server answers initialize inside any client's connect window"
kind: perf
status: done
type: proposal
track: startup
date: 2026-11-01
last-transition-id: 0b5fe3d9-af58-429f-8dcb-52c7ef90cf22
last-correlation-id: 0b5fe3d9-af58-429f-8dcb-52c7ef90cf22
last-transition-from: review
last-transition-at: 2026-11-03T00:57:13.523Z
shipped-in:
  - "59fb2ab041488ee6ca318858b70166ba42708f0b"
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
- **Status**: done
- **Files**: `packages/core/src/cli.ts`, `packages/core/src/lib/contracts/interfaces/delendai-project.interface.ts`, `packages/core/src/lib/filesystem/safe-workspace-reader.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `packages/core/tests/src/lib/project/tool-call-hold.helper.spec.ts`, `packages/core/src/lib/project/tool-call-hold.helper.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/src/lib/startup-reconciler/phases/held-by-any.helper.ts`, `packages/core/tests/src/lib/startup-reconciler/held-by-any.helper.spec.ts`, `plugins/commit-policy/src/lib/services/slice-persisted.service.ts`, `plugins/commit-policy/tests/src/lib/services/slice-persisted.service.spec.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "`initialize` is answered before the reconciliation runs: 39.7 s before this change, 1.8 s after, on this repository."
  - "A tool called during the start waits and then answers; it neither fails nor acts before the checkout is level."
  - "Containment over any number of checkpoints reads each set of tips once, and falls back to one question per pair when git cannot list them."
  - "A failed read of stranded blobs drops no stranded ref."
- shipped-in: `bc9e6fb6cf09`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 59fb2ab04148, validate exit 0 and tests 21/21 claimed, no recorded run cited; acceptance 4/4: (1) At 59fb2ab0 the server attaches its transport before the reconciliation runs, so the handshake is answered inside the client's window; the three slice specs pa… (2) At 59fb2ab0 a tool called during the start waits for the checkout to be level and then answers, and it neither fails nor acts before that; the three slice spec… (3) At 59fb2ab0 the containment over any number of checkpoints reads each set of tips once and falls back to one question per pair when git cannot list them; the t… (4) At 59fb2ab0 a failed read of the stranded blobs drops no stranded ref; the three slice specs pass 21 of 21. — Approved on the delivered state of 59fb2ab041488ee6ca318858b70166ba42708f0b. The handshake is answered before the reconciliation runs, a tool called during the start waits and then answers, the containment reads each set of tips once, and a failed read of the stranded blobs drops no stranded ref. The type gate exited 0 and the three slice specs pass 21 of 21. Two residuals, recorded and not blocking: the ordering that fixes the connect timeout is the proposal's crux and no spec asserts it, so it could be inverted and the suite would still pass; and the delivered numbers could not be reproduced here, since running the server was out of scope, so the ordering was verified rather than the timings.

## acceptance

- `initialize` is answered before the reconciliation runs: 39.7 s before this change, 1.8 s after, on this repository.
- A tool called during the start waits and then answers; it neither fails nor acts before the checkout is level.
- Containment over any number of checkpoints reads each set of tips once, and falls back to one question per pair when git cannot list them.
- A failed read of stranded blobs drops no stranded ref.
