---
id: f00369
title: "token dashboard tracked está fresco."
kind: feat
status: in-progress
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#token-dashboard-tracked-esta-fresco
shipped-in: ["82c54bccc94ab11c524f187c671da854e522ab7d"]
last-transition-id: 5fd4ac24-fede-4e63-9c83-9ccc7f7b6444
last-correlation-id: 5fd4ac24-fede-4e63-9c83-9ccc7f7b6444
last-transition-from: ready
---

# f00369 — token dashboard tracked está fresco.

## Goal

Migrated work item: token dashboard tracked está fresco..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/f00369-token-dashboard-tracked-esta-fresco.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#token-dashboard-tracked-esta-fresco` by `proposal_adopt`
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

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): ran 'bun run tokens:dashboard:check' (tools/scripts/test/run-token-dashboard-check.script.ts). Output: '[token-dashboard-check] in sync: /home/cartago/_projects/mcp-vertex/docs/mcp-vertex/TOKEN-BUDGETS.md' — the tracked dashboard doc matches the live-measured values, and this check is wired into validate:run so drift is caught in CI. Acceptance genuinely met; closing.
