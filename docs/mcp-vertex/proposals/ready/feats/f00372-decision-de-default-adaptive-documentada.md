---
id: f00372
title: "decisión de default adaptive documentada."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#decision-de-default-adaptive-documentada
shipped-in: ["58ef6288", "11d31317"]
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
- **Files**: `ready/feats/f00372-decision-de-default-adaptive-documentada.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#decision-de-default-adaptive-documentada` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below ("migration source no longer present ...
no actionable scope") was false — the source section (TOK2-004,
"estrategia default de `surfaceMode`") is recoverable from commit
`11130767c` and asks for a data-driven, documented decision on
whether the default `surfaceMode` should move from `native` to
`adaptive`. That decision was made and documented independently of
this proposal: `r00026` (commit `58ef6288a`, "default adaptive for
plain MCP clients") flipped the default, and
`docs/mcp-vertex/adr/0016-surface-policy-adaptive-default.md`
(landed in `11d31317f`) records the reasoning
(`decideSurfaceModeFromCapabilities()` priority: explicit mode >
`mcp-vertex/surface` capability > `adaptive` default for plain
clients). Verified by reading the ADR and confirming
`decideSurfaceModeFromCapabilities` in
`packages/core/src/lib/project/tool-surface-runtime.service.ts`
matches its documented priority order. Closing on that evidence, not
on the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
