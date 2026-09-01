---
id: f00312
title: "Solo internal frames."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#solo-internal-frames
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: 5f347e5e-a09b-4170-8e1a-3690d8fd53aa
last-correlation-id: 5f347e5e-a09b-4170-8e1a-3690d8fd53aa
last-transition-from: in-progress
---

# f00312 — Solo internal frames.

## Goal

Migrated work item: Solo internal frames..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00312-solo-internal-frames.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 checklist: 'Solo internal frames', internal-classifier/frame-extractor design) is shipped: frame-extractor.helper.ts maintains an internalPathRegistry (mcp-scope/monorepo-root/package-root prefixes) and only frames matching @mcp-vertex/* package boundaries are kept and rewritten to package-relative form; internal-classifier.helper.ts + origin-analyzer.helper.ts gate whether a failure even counts as internal before any frame is considered. Ran privacy-validator.spec.ts + privacy-adversarial*.spec.ts: 23 tests pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#solo-internal-frames` by `proposal_adopt`
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
