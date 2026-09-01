---
id: f00309
title: "Raw results prohibidos."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#raw-results-prohibidos
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: 6939dce9-4f79-4793-af50-6d0e28ff252b
last-correlation-id: 6939dce9-4f79-4793-af50-6d0e28ff252b
last-transition-from: in-progress
---

# f00309 — Raw results prohibidos.

## Goal

Migrated work item: Raw results prohibidos..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00309-raw-results-prohibidos.md`
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
- review-implementer: sonnet-reviewer-6
- review-reviewer: sonnet-reviewer-6-verify
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 checklist: 'Raw results prohibidos') is shipped: ISafeMcpVertexReport in plugins/error-reporting/src/lib/contracts/interfaces/reporter.interface.ts has no raw tool-result field at all; only typed safe fields (reporterVersion, safeToolId, toolOwner, toolCategory, errorCode, failureClass, classification, fingerprint, mcpFrames, syntheticExample, environmentClass). knowledge/error-reporting.ts explicitly documents 'result' as one of the fields that is 'Never sent'. privacy-validator.helper.ts additionally rejects any string that looks like a JSON/XML/SQL fragment leaking through. Ran privacy-validator.spec.ts + privacy-adversarial*.spec.ts: 23 tests pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-results-prohibidos` by `proposal_adopt`
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
