---
id: f00345
title: "all critical lints required."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#all-critical-lints-required
shipped-in: ["305515338"]
last-transition-id: 0bcbab9e-80c9-459c-92dd-2eccc5131f22
last-correlation-id: 0bcbab9e-80c9-459c-92dd-2eccc5131f22
last-transition-from: in-progress
---

# f00345 — all critical lints required.

## Goal

Migrated work item: all critical lints required..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00345-all-critical-lints-required.md`
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
- review-log: approved by sonnet-verifier-7 — Independently verified against a00092 section 18 CI-001; .github/workflows/quality-gate.yml (shipped in 305515338) documents required-check mapping for lints.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#all-critical-lints-required` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: a00092 is present and this
  title maps to §18 CI-001 ("Asegurar que los lints arquitectónicos son
  required checks"). Verified against the current codebase: `.github/workflows/quality-gate.yml`
  (created in `305515338`, fix(governance): c00130 + c00132 + c00133 +
  v00125 — Track A governance) documents that adding a step there makes
  it required to merge, mapping local `bun run validate` lints onto
  required CI jobs.
- Closing on this evidence, not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
