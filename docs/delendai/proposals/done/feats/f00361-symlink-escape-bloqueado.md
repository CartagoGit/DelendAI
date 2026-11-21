---
id: f00361
title: "symlink escape bloqueado."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#symlink-escape-bloqueado
shipped-in: ["9819d8fe1e0637c998706e9eec31d1e6c2235fdb"]
last-transition-id: c63a52e9-b7e3-4f10-b475-c8a83d4677a7
last-correlation-id: c63a52e9-b7e3-4f10-b475-c8a83d4677a7
last-transition-from: review
---

# f00361 — symlink escape bloqueado.

## Goal

Migrated work item: symlink escape bloqueado..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00361-symlink-escape-bloqueado.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts' -> 32 pass, 0 fail, 46 expect() calls; confirmed commit 9819d8fe1 (x00241, safe workspace reader API) is an ancestor of develop HEAD. Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#symlink-escape-bloqueado` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts' -> 32 pass, 0 fail, 46 expect() calls; confirmed commit 9819d8fe1 (x00241, safe workspace reader API) is an ancestor of develop HEAD. Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): the shared safe-reader primitive (packages/core/src/lib/filesystem/safe-workspace-reader.ts, shipped x00241 9819d8fe1) performs a realpath-validated symlink walk and rejects any resolution escaping the workspace ('symlink-outside' kind in safe-workspace-reader.types.ts). Test suite packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts passes: 'bun test packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts' -> 32 pass, 0 fail, 46 expect() calls. This primitive is what backs the containment tests in f00359/f00360 above. Acceptance genuinely met; closing.
