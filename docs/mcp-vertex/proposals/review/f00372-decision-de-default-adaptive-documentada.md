---
id: f00372
title: "decisión de default adaptive documentada."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#decision-de-default-adaptive-documentada
shipped-in: ["58ef6288", "11d31317"]
last-transition-id: 4705e3e6-55ee-4198-b268-d68acddf4c2a
last-correlation-id: 4705e3e6-55ee-4198-b268-d68acddf4c2a
last-transition-from: in-progress
---

# f00372 — decisión de default adaptive documentada.

## Goal

Migrated work item: decisión de default adaptive documentada..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00372-decision-de-default-adaptive-documentada.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: in_review
- review-implementer: sonnet-verifier-9
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#decision-de-default-adaptive-documentada` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below ("migration source no longer present ...
no actionable scope") was false — the source section (TOK2-004,
"estrategia default de `surfaceMode`") is recoverable from commit
`11130767c` and asks for a data-driven, documented decision on
whether the default `surfaceMode` should move away from `native`.
That decision was made and documented independently of this
proposal, twice: `r00026` (commit `58ef6288a`) flipped the default to
`adaptive`, documented in
`docs/mcp-vertex/adr/0016-surface-policy-adaptive-default.md`
(landed `11d31317f`); the decision was then revisited and the default
moved again to `managed`, documented in
`docs/mcp-vertex/adr/0017-surface-policy-managed-default.md`
("Accepted", 2026-08-26), which ADR 0016 itself references as its
successor. Verified by reading both ADRs and confirming
`decideSurfaceModeFromCapabilities` in
`packages/core/src/lib/surface/decide-mode.ts` implements exactly the
priority order ADR 0017 documents (explicit mode > known host profile
> `mcp-vertex/surface` listChanged signal -> `managed` > default
`native` fallback for unknown/no-signal clients). Closing on that
evidence, not on the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
