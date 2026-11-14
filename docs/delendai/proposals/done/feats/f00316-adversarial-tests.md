---
id: f00316
title: "Adversarial tests."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#adversarial-tests
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: 85808666-2618-4120-b3af-cf6bfc5db5da
last-correlation-id: 85808666-2618-4120-b3af-cf6bfc5db5da
last-transition-from: in-progress
---

# f00316 — Adversarial tests.

## Goal

Migrated work item: Adversarial tests..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00316-adversarial-tests.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 ER-007 / checklist 'Adversarial tests') is shipped: plugins/error-reporting/tests/privacy-adversarial.spec.ts and privacy-adversarial-llm-suffix-spoofing.spec.ts specifically try to smuggle private data past the validator (spoofed suffixes, disguised paths/tokens/etc). Ran the full adversarial suite: privacy-validator.spec.ts + privacy-adversarial.spec.ts + privacy-adversarial-llm-suffix-spoofing.spec.ts + synthetic-example.builder.spec.ts = 23 tests, all pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#adversarial-tests` by `proposal_adopt`
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
