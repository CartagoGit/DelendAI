---
id: f00297
title: "Process output caps son caps reales."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#process-output-caps-son-caps-reales
last-transition-id: 07727079-d92d-4d1d-9490-d4c9123b2c36
last-correlation-id: 07727079-d92d-4d1d-9490-d4c9123b2c36
last-transition-from: in-progress
---

# f00297 — Process output caps son caps reales.

## Goal

Migrated work item: Process output caps son caps reales..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00297-process-output-caps-son-caps-reales.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: done
- review-implementer: copilot-orchestrator-bulk-retire-placeholders
- review-reviewer: sonnet-reviewer-2
- review-log: approved by sonnet-reviewer-2 — Verified independently: migration source is NOT gone - survives in done/audits/a00092 (TODO PR-001/PR-002/PR-003: maxOutputBytes must be real bytes, chunks trimmed to exact remaining bytes, combined stdout+stderr cap). Checked packages/core/src/lib/shared/run-command.ts: createByteCollector uses Buffer.byteLength, captureUtf8Bytes trims chunk.subarray(0,bytesToTake) to the exact remaining budget and shares budget across stdout+stderr via sharedCollector; truncateUtf8Buffer avoids invalid partial multibyte output. Ran tests/src/lib/shared/run-command-bytes.spec.ts -> 8/8 passed, incl. 'caps stdout by real UTF-8 bytes, not UTF-16 code units', 'truncates a chunk to the exact remaining bytes', 'enforces maxOutputBytes across stdout and stderr combined'.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#process-output-caps-son-caps-reales` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
