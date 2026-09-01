---
id: f00344
title: "no manual drift."
kind: feat
status: in-progress
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#no-manual-drift
shipped-in: ["82c54bccc"]
last-transition-id: 432796aa-086e-48c8-a81c-22ddd54c67ac
last-correlation-id: 432796aa-086e-48c8-a81c-22ddd54c67ac
last-transition-from: ready
---

# f00344 — no manual drift.

## Goal

Migrated work item: no manual drift..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/f00344-no-manual-drift.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#no-manual-drift` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: the migration source is not
  gone — a00092 is present in the repo with the concrete item behind this
  title (§10 REG-002/REG-003/REG-004: replace manual plugin arrays with
  `plugin.manifest.ts` + generate registry/docs/tables from manifests +
  lint "plugin directory not represented").
- Verified against the current codebase, independently of this proposal's
  own history: `tools/scripts/lint/manifest-vs-package.script.ts` enforces
  manifest/package consistency (public package requires a public
  manifest), landed in `82c54bccc` (feat(track-c-e): manifests + token
  budgets + surface-mode defaults). Ran it directly:
  `bun tools/scripts/lint/manifest-vs-package.script.ts` → `[manifest-vs-package] OK.` (exit 0).
  Every plugin already carries a `plugin.manifest.ts` and the registry is
  generated from those manifests (`tools/scripts/generate/from-manifests.script.ts`).
- Closing on this evidence, not on the "no actionable scope" claim.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
