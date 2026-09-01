---
id: f00361
title: "symlink escape bloqueado."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#symlink-escape-bloqueado
shipped-in: ["9819d8fe1e0637c998706e9eec31d1e6c2235fdb"]
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
- **Files**: `ready/feats/f00361-symlink-escape-bloqueado.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#symlink-escape-bloqueado` by `proposal_adopt`
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

Independent re-verification (sonnet-verifier-8): the shared safe-reader primitive (packages/core/src/lib/filesystem/safe-workspace-reader.ts, shipped x00241 9819d8fe1) performs a realpath-validated symlink walk and rejects any resolution escaping the workspace ('symlink-outside' kind in safe-workspace-reader.types.ts). Test suite packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts passes: 'bun test packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts' -> 32 pass, 0 fail, 46 expect() calls. This primitive is what backs the containment tests in f00359/f00360 above. Acceptance genuinely met; closing.
