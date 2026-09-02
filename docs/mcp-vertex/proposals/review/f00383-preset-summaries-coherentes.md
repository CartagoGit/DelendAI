---
id: f00383
title: "preset summaries coherentes."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#preset-summaries-coherentes
shipped-in: ["916c0673"]
last-transition-id: 28138d19-8915-42e6-a7dc-3f9556b77d2d
last-correlation-id: 28138d19-8915-42e6-a7dc-3f9556b77d2d
last-transition-from: in-progress
---

# f00383 — preset summaries coherentes.

## Goal

Migrated work item: preset summaries coherentes..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00383-preset-summaries-coherentes.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed derivePresetSummary in packages/core/src/lib/plugins/preset-derived.ts builds summaries from real resolved membership, and ran bun test packages/core/tests/src/lib/plugins/preset-catalog.spec.ts myself: 24/24 pass. PRE2-001 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#preset-summaries-coherentes` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: PRE2-001, preset summaries must reflect real membership
(the audit specifically calls out `backend-api` naming plugins that
aren't actually members); no summary should be hand-written listing
plugins independently of the real preset definition. Verified
directly: `packages/core/src/lib/plugins/preset-derived.ts` exports
`derivePresetSummary({ id, resolvedMembers, independent })`, which
builds the summary text purely from the preset's actual resolved
member list (with a `+N more` preview beyond 6); `preset-catalog.ts`
calls it for every preset, `backend-api` included, instead of storing
a manual string. Ran the catalog's own test myself: `bunx vitest run
tests/src/lib/plugins/preset-catalog.spec.ts` → 24 passed. Shipped by
`r00020` ("presets summaries y presupuestos derivados del membership
real — PRE2-001/PRE2-002"), commit `916c0673`. Closing on that
evidence, not on the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed derivePresetSummary in packages/core/src/lib/plugins/preset-derived.ts builds summaries from real resolved membership, and ran bun test packages/core/tests/src/lib/plugins/preset-catalog.spec.ts myself: 24/24 pass. PRE2-001 is satisfied.
