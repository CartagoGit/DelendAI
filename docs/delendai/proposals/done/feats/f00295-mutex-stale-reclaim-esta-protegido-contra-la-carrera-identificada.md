---
id: f00295
title: "Mutex stale reclaim está protegido contra la carrera identificada."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#mutex-stale-reclaim-esta-protegido-contra-la-carrera-identificada
last-transition-id: 2cf75ae2-1a77-45ef-bfdf-6c588d6e2e40
last-correlation-id: 2cf75ae2-1a77-45ef-bfdf-6c588d6e2e40
last-transition-from: in-progress
---

# f00295 — Mutex stale reclaim está protegido contra la carrera identificada.

## Goal

Migrated work item: Mutex stale reclaim está protegido contra la carrera identificada..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00295-mutex-stale-reclaim-esta-protegido-contra-la-carrera-identificada.md`
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
- review-log: approved by sonnet-reviewer-2 — Verified independently: migration source is NOT gone - survives in done/audits/a00092 (TODO MX-001: stale-lock reclaim race with waiter-observes-stale/holder-heartbeat/waiter-reclaim scenario). Checked packages/core/src/lib/shared/with-file-mutex.ts: generation-token lease payload, heartbeat revalidation before reclaim. Ran the exact race tests: with-file-mutex-reclaim.spec.ts ('does not reclaim when a holder heartbeats between stale observation and reclaim') + with-file-mutex.race.spec.ts (MUT2-001, 'does not open a third-contender window when a holder heartbeats after stale observation') -> 4/4 passed.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#mutex-stale-reclaim-esta-protegido-contra-la-carrera-identificada` by `proposal_adopt`
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
