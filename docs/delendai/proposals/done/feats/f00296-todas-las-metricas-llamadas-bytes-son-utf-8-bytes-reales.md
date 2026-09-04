---
id: f00296
title: "Todas las métricas llamadas bytes son UTF-8 bytes reales."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#todas-las-metricas-llamadas-bytes-son-utf-8-bytes-reales
last-transition-id: beef49ae-3e54-4a6f-9a06-503edb7e615a
last-correlation-id: beef49ae-3e54-4a6f-9a06-503edb7e615a
last-transition-from: in-progress
---

# f00296 — Todas las métricas llamadas bytes son UTF-8 bytes reales.

## Goal

Migrated work item: Todas las métricas llamadas bytes son UTF-8 bytes reales..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00296-todas-las-metricas-llamadas-bytes-son-utf-8-bytes-reales.md`
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
- review-log: approved by sonnet-reviewer-2 — Verified independently: migration source is NOT gone - survives in done/audits/a00092 (TODO MET-001: use Buffer.byteLength(text,'utf8')). Checked packages/core/src/lib/metrics/metrics-registry.ts: bytesOfText = Buffer.byteLength(text,'utf8'), used by estimateResultBytes/estimateResultCost/estimateErrorCost - real UTF-8 byte accounting, not UTF-16 .length. Ran tests/src/lib/metrics/bytes-and-errors.spec.ts + metrics.spec.ts -> 24/24 passed, incl. 'measures UTF-8 bytes for multibyte text correctly' and 'counts error responses and does not leak private invocation data'.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#todas-las-metricas-llamadas-bytes-son-utf-8-bytes-reales` by `proposal_adopt`
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
