---
id: f00378
title: "permissions generated."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#permissions-generated
shipped-in: ["82c54bcc"]
last-transition-id: b87395e7-18a2-4dc3-a7e9-897f2090624c
last-correlation-id: b87395e7-18a2-4dc3-a7e9-897f2090624c
last-transition-from: in-progress
---

# f00378 — permissions generated.

## Goal

Migrated work item: permissions generated..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00378-permissions-generated.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#permissions-generated` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MAN2-006, "generar permission matrix" — a real
plugin/tool → permissions table generated from manifests, used by
docs/selector/optimizer/adoption/review. Verified directly:
`docs/mcp-vertex/security/permission-matrix.md` exists as a generated
artifact, and `bun tools/scripts/lint/check-generated-artifacts.script.ts`
(which regenerates and diffs every manifest-derived artifact,
including this one) reported "All generated artifacts are in sync."
Implemented by `f00175` (MAN2-003..006 generators), shipped in
`82c54bcc`. Closing on that evidence, not on the placeholder
review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
