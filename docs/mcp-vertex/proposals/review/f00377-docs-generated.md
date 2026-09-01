---
id: f00377
title: "docs generated."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#docs-generated
shipped-in: ["82c54bcc"]
last-transition-id: ad39fbd1-897d-42b2-9477-ef0458713dff
last-correlation-id: ad39fbd1-897d-42b2-9477-ef0458713dff
last-transition-from: in-progress
---

# f00377 — docs generated.

## Goal

Migrated work item: docs generated..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00377-docs-generated.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#docs-generated` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MAN2-005, "generar docs de plugins" (plugin list,
maturity, permissions, presets, capabilities, token budget — data
generated, editorial text may stay manual). Verified directly:
`tools/scripts/docs/generate-catalog.script.ts` exists, is exercised
by `tools/scripts/docs/generate-catalog.script.spec.ts`, and its
output (`docs/mcp-vertex/plugins/generated/plugin-manifests.generated.md`
/ `.json`) is covered by
`bun tools/scripts/lint/check-generated-artifacts.script.ts`, which
reported "All generated artifacts are in sync." Implemented by
`f00175` (MAN2-003..006 generators), shipped in `82c54bcc`. Closing
on that evidence, not on the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
