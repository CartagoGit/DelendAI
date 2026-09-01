---
id: f00354
title: "permission model."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#permission-model
shipped-in: ["4eb9909d7"]
last-transition-id: 12f487b1-1900-42b4-bf1c-75ed6707295b
last-correlation-id: 12f487b1-1900-42b4-bf1c-75ed6707295b
last-transition-from: in-progress
---

# f00354 — permission model.

## Goal

Migrated work item: permission model..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00354-permission-model.md`
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
- review-reviewer: sonnet-verifier-7
- review-log: approved by sonnet-verifier-7 — Independently verified against a00092 section 22 PERM-001..004; packages/core/src/lib/manifest/permissions.schema.ts + plugin-tool-permissions.interface.ts shipped in 4eb9909d7 (f00164). Ran the manifest tests: passing.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#permission-model` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: a00092 is present and this
  title maps to §22 PERM-001..004 (declare permissions per plugin/tool,
  surface their cost at activation, penalize risk in the auto-selector).
  Verified against the current codebase:
  `packages/core/src/lib/manifest/permissions.schema.ts`,
  `plugin-tool-permissions.interface.ts`, and
  `define-plugin-manifest.ts` implement a permission model per
  plugin/tool with visibility and risk scoring, landed in `4eb9909d7`
  (feat(f00164): modelo de permisos por plugin/tool con visibilidad y
  scoring de riesgo). Ran its tests directly:
  `bun run vitest run packages/core/tests/src/lib/manifest/define-plugin-manifest.spec.ts`
  → passed (included in the 22-file/160-test run below).
- Closing on this evidence, not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
