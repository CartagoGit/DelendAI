---
id: f00359
title: "context-for-change no abre rutas exteriores."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#context-for-change-no-abre-rutas-exteriores
shipped-in: ["7eea421dff14018cc8af78d6239d32dba9b7470d"]
---

# f00359 — context-for-change no abre rutas exteriores.

## Goal

Migrated work item: context-for-change no abre rutas exteriores..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `ready/feats/f00359-context-for-change-no-abre-rutas-exteriores.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#context-for-change-no-abre-rutas-exteriores` by `proposal_adopt`
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

Independent re-verification (sonnet-verifier-8): actionable scope did exist and was already delivered elsewhere in develop. `context_for_change` is implemented at plugins/context-for-change/src/lib/tools/context-for-change.tool.ts and plugins/context-for-change/src/lib/services/context-for-change.service.ts, routed through the shared WorkspaceContainmentError-throwing safe reader (packages/core/src/lib/filesystem/safe-workspace-reader.ts, shipped x00241 9819d8fe1 + x00242 7eea421df). Test plugins/context-for-change/tests/src/context-for-change.tool.spec.ts::'rejects adversarial workspace-escape and reserved paths with a structured error' exercises symlink-escape, ../ traversal and reserved paths and passes: 'bun test plugins/context-for-change/tests/src/context-for-change.tool.spec.ts' -> 6 pass, 0 fail, 75 expect() calls. Acceptance genuinely met; closing.
