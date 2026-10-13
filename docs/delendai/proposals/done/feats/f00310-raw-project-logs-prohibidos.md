---
id: f00310
title: "Raw project logs prohibidos."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#raw-project-logs-prohibidos
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: c4f04d62-0225-46c7-8e65-1d0cf6d23629
last-correlation-id: c4f04d62-0225-46c7-8e65-1d0cf6d23629
last-transition-from: in-progress
---

# f00310 — Raw project logs prohibidos.

## Goal

Migrated work item: Raw project logs prohibidos..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00310-raw-project-logs-prohibidos.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 checklist: 'Raw project logs prohibidos') is shipped: the reporter accepts only mcp-vertex-internal failures backed by typed internal errors or @mcp-vertex/* frame evidence (knowledge/error-reporting.ts: 'External project data is non-reportable by construction'); the safe DTO has no cwd/workspace/repo/log field, and knowledge doc lists 'workspace, cwd' among fields 'Never sent'. frame-extractor.helper.ts strips any non-@mcp-vertex frame before a stack is ever considered. Ran privacy-validator.spec.ts + privacy-adversarial*.spec.ts: 23 tests pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-project-logs-prohibidos` by `proposal_adopt`
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
