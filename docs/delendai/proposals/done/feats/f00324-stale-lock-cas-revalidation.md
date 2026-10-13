---
id: f00324
title: "Stale-lock CAS/revalidation."
kind: feat
status: done
type: proposal
track: migrated
shipped-in: ["1bcc6f491717d22ab8514a1ca00b36ec956cb097"]  # bulk book-keeping close of migrated placeholder
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#stale-lock-cas-revalidation
last-transition-id: b3698e25-cdde-4f41-b820-aefdd90457bb
last-correlation-id: b3698e25-cdde-4f41-b820-aefdd90457bb
last-transition-from: review
---

# f00324 — Stale-lock CAS/revalidation.

## Goal

Migrated work item: Stale-lock CAS/revalidation..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00324-stale-lock-cas-revalidation.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by claude-opus5-orchestrator — Independent
  verification, 2026-09-01. The original bulk-close claimed the migration
  source was gone; it is present at
  `docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md`.
  Checked against the real code instead: the stale-lock CAS/revalidation the audit asked for is live in `packages/core/src/lib/shared/with-file-mutex.ts` (generation-token lease + heartbeat revalidation, 17 references); `with-file-mutex-reclaim.spec.ts` and `with-file-mutex.race.spec.ts` pass.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#stale-lock-cas-revalidation` by `proposal_adopt`
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
